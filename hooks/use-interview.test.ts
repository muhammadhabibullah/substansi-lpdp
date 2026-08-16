// @vitest-environment jsdom
/**
 * hooks/use-interview.test.ts — hook-level coverage for the interview turn
 * lifecycle (AGENTS.md testing guidance: deterministic logic, mocked LLM).
 *
 * The vitest include pattern already matches `hooks/*.test.ts`; this file
 * opts into jsdom per-file because it renders the hook with `react-dom`,
 * while the pure-logic `lib/` tests keep running in the node environment.
 * The LLM boundary (`streamComplete`), storage, moderator, and note-taker
 * are mocked so no request ever leaves the test process.
 */

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { streamComplete, type StreamOptions } from '@/lib/llm';
import { EMPTY_PROFILE, type LlmSettings } from '@/lib/types';

import { useInterview, type UseInterviewResult } from './use-interview';

/* ── Boundary mocks ──────────────────────────────────────────────────────── */

vi.mock('@/lib/storage', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/storage')>();
  return {
    ...actual,
    loadSession: () => null,
    saveSession: () => {},
    saveDocuments: () => {},
    clearSession: () => {},
  };
});

vi.mock('@/lib/panel/moderator', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/panel/moderator')>();
  return {
    ...actual,
    decideNextSpeaker: vi.fn(async () => ({
      panelist: 'akademisi' as const,
      directive: 'Buka wawancara dengan hangat.',
    })),
  };
});

vi.mock('@/lib/panel/notetaker', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/panel/notetaker')>();
  return {
    ...actual,
    annotateAnswer: vi.fn(async () => null),
  };
});

vi.mock('@/lib/llm', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/llm')>();
  return {
    ...actual,
    streamComplete: vi.fn(),
  };
});

/* ── Test harness ────────────────────────────────────────────────────────── */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SETTINGS: LlmSettings = {
  baseUrl: 'http://localhost:1234/v1',
  apiKey: 'test-key',
  model: 'test-model',
  cheapModel: 'test-cheap-model',
  temperature: 0.7,
  presetId: 'lmstudio',
};

/** A pending `streamComplete` call the test can drive step by step. */
interface StreamHandle {
  options: StreamOptions;
  delta: (text: string) => void;
  truncationRetry: () => void;
  resolve: (text: string) => void;
}

const streams: StreamHandle[] = [];
const mockedStreamComplete = vi.mocked(streamComplete);

beforeEach(() => {
  streams.length = 0;
  mockedStreamComplete.mockReset();
  mockedStreamComplete.mockImplementation(
    (options: StreamOptions) =>
      new Promise<string>((resolve) => {
        streams.push({
          options,
          delta: (text) => options.onDelta?.(text),
          truncationRetry: () => options.onTruncationRetry?.(),
          resolve,
        });
      }),
  );
});

let dispose: (() => Promise<void>) | null = null;

afterEach(async () => {
  await dispose?.();
  dispose = null;
});

async function renderInterview(): Promise<{
  result: { current: UseInterviewResult };
  unmount: () => Promise<void>;
}> {
  const result: { current: UseInterviewResult | null } = { current: null };
  function Probe() {
    result.current = useInterview({
      settings: SETTINGS,
      documents: {},
      profile: EMPTY_PROFILE,
      ready: true,
    });
    return null;
  }

  const container = document.createElement('div');
  const root = createRoot(container);
  await React.act(async () => {
    root.render(React.createElement(Probe));
  });

  let disposed = false;
  const unmount = async () => {
    if (disposed) return;
    disposed = true;
    // In-flight streams stay pending: the hook's unmount effect aborts the
    // controller itself, and a never-settling promise can no longer land a
    // setState on the unmounted root.
    streams.length = 0;
    await React.act(async () => {
      root.unmount();
    });
  };
  dispose = unmount;

  return { result: result as { current: UseInterviewResult }, unmount };
}

/* ── Tests ───────────────────────────────────────────────────────────────── */

describe('useInterview turn lifecycle', () => {
  it('rejects a second submit while a panel turn is in flight', async () => {
    const { result } = await renderInterview();

    await React.act(async () => {
      result.current.start();
    });
    expect(result.current.busy).toBe(true);
    expect(streams).toHaveLength(1);

    // While the opening turn streams, submitting is a no-op: the answer is
    // not recorded and no new panel turn is started.
    await React.act(async () => {
      result.current.submitAnswer('Jawaban pertama saya.');
    });
    expect(streams).toHaveLength(1);
    expect(result.current.session?.turns.some((turn) => turn.speaker === 'user')).toBe(false);

    // Once the turn lands the guard lifts and the next submit goes through.
    await React.act(async () => {
      streams[0]!.resolve('Selamat datang di simulasi wawancara.');
    });
    expect(result.current.busy).toBe(false);

    await React.act(async () => {
      result.current.submitAnswer('Terima kasih, saya siap.');
    });
    expect(
      result.current.session?.turns.some(
        (turn) => turn.speaker === 'user' && turn.text === 'Terima kasih, saya siap.',
      ),
    ).toBe(true);
  });

  it('aborts the in-flight turn when the component unmounts', async () => {
    const { result, unmount } = await renderInterview();

    await React.act(async () => {
      result.current.start();
    });
    const signal = streams[0]!.options.signal;
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);

    await unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('resets the live streaming buffer before a truncation retry', async () => {
    const { result } = await renderInterview();

    await React.act(async () => {
      result.current.start();
    });
    const stream = streams[0]!;

    await React.act(async () => {
      stream.delta('Pertanyaan yang terpot');
    });
    expect(result.current.streaming?.text).toBe('Pertanyaan yang terpot');

    // The token-capped retry regenerates the turn from scratch, so the
    // buffer must reset before new deltas arrive.
    await React.act(async () => {
      stream.truncationRetry();
    });
    expect(result.current.streaming?.text).toBe('');

    await React.act(async () => {
      stream.delta('ong lengkap ini.');
    });
    // Without the reset this would read 'Pertanyaan yang terpotong lengkap ini.'.
    expect(result.current.streaming?.text).toBe('ong lengkap ini.');

    await React.act(async () => {
      stream.resolve('Pertanyaan lengkap hasil retry.');
    });
    expect(result.current.streaming).toBeNull();
    expect(
      result.current.session?.turns.some(
        (turn) => turn.speaker === 'akademisi' && turn.text === 'Pertanyaan lengkap hasil retry.',
      ),
    ).toBe(true);
  });
});
