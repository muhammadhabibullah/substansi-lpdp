// @vitest-environment jsdom
/**
 * app/interview/interview-screen.test.tsx — integration coverage for the
 * screen → hook → LLM wiring (interview-screen.tsx ↔ use-interview.ts ↔
 * lib/llm.ts).
 *
 * Unlike `hooks/use-interview.test.ts` (which mocks the LLM boundary), these
 * tests run the *real* moderator, engine, personas, note-taker, and llm
 * modules end-to-end and only stub the network: `fetch` is replaced with an
 * OpenAI-compatible router (same pattern as `lib/llm.test.ts`), so no live
 * API key is ever needed and no request leaves the test process.
 *
 * Covered wiring:
 *  1. phase → panelist handoff: the moderator's JSON decision selects the
 *     speaker and the directive lands in the panelist prompt;
 *  2. voice composer → hook → llm: a spoken transcript is recorded behind
 *     the WhatsApp-style recording bar (no live text), finished into the
 *     editable review state, corrected, and submitted into the next turn;
 *  3. truncation-retry buffer: `onTruncationRetry` (lib/llm) resets the
 *     screen's live streaming buffer before the regenerated turn renders.
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/components/i18n-provider';
import {
  saveDocuments,
  saveProfile,
  saveSettings,
  STORAGE_KEYS,
} from '@/lib/storage';
import {
  EMPTY_PROFILE,
  type DocKind,
  type DocumentSet,
  type LlmSettings,
  type ParsedDoc,
  type PanelistId,
  type Profile,
} from '@/lib/types';
import type { SpeechRecognitionEventLike } from '@/lib/voice';

import { InterviewScreen } from './interview-screen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ── Setup fixtures ──────────────────────────────────────────────────────── */

// Local endpoint: no API key needed, and 'test-model' is unknown to the
// reasoning-model sanitizer, so request bodies keep the classic field names.
const SETTINGS: LlmSettings = {
  baseUrl: 'http://localhost:1234/v1',
  apiKey: '',
  model: 'test-model',
  cheapModel: 'test-cheap-model',
  temperature: 0.7,
  presetId: 'lmstudio',
};

const PROFILE: Profile = {
  ...EMPTY_PROFILE,
  name: 'Budi Santoso',
  universitas: 'Institut Teknologi Bandung',
  prodi: 'Magister Informatika',
  bidang: 'machine learning',
};

function makeDoc(kind: DocKind, text: string): ParsedDoc {
  return {
    kind,
    fileName: '',
    source: 'paste',
    text,
    charCount: text.length,
    parsedAt: 0,
  };
}

const DOCUMENTS: DocumentSet = {
  cv: makeDoc('cv', 'Latar belakang rekayasa perangkat lunak lima tahun.'),
  studyPlan: makeDoc('studyPlan', 'Rencana studi magister di bidang machine learning.'),
  essay: makeDoc('essay', 'Kontribusi: platform pendidikan terbuka untuk daerah 3T.'),
};

/* ── Stubbed OpenAI-compatible endpoint ──────────────────────────────────── */

interface ModeratorReply {
  panelist: PanelistId;
  directive: string;
}

/** Decisions the moderator endpoint returns, in order. */
const moderatorQueue: ModeratorReply[] = [];
/** Panelist stream producers, in order — each returns the SSE response. */
const panelistQueue: Array<() => Promise<Response> | Response> = [];
/** Every request body the screen/hook/llm stack sent, in order. */
const requestBodies: Array<Record<string, unknown>> = [];

/** OpenAI-compatible SSE stream ending with the given finish reason. */
function sseStream(content: string, finishReason: string): string {
  return [
    `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'test-model', choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'test-model', choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
}

function sseResponse(content: string, finishReason = 'stop'): Response {
  return new Response(sseStream(content, finishReason), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** Non-streaming chat completion whose reply is `content`. */
function jsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 0,
      model: 'test-model',
      choices: [
        { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function pushPanelistTurn(content: string): void {
  panelistQueue.push(() => sseResponse(content));
}

/**
 * First stream hits the token cap. Its delta renders live, but the finish
 * event and the retry response each wait on a gate the test releases,
 * resolving one macrotask later — those gaps let React commit the partial
 * render and then the buffer reset between the stream's stages.
 */
function pushTruncatedThenGatedRetry(partial: string, full: string): {
  releaseFirstFinish: () => void;
  releaseRetry: () => void;
} {
  let releaseFirstFinish!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirstFinish = resolve;
  });
  let releaseRetry!: () => void;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });

  const encoder = new TextEncoder();
  const sseEvent = (delta: { content?: string }, finishReason: string | null): string =>
    `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'test-model', choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;

  panelistQueue.push(() => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // The partial text streams straight away; the token-cap finish only
        // lands once the test releases it.
        controller.enqueue(encoder.encode(sseEvent({ content: partial }, null)));
        void firstGate.then(() => {
          setTimeout(() => {
            controller.enqueue(encoder.encode(sseEvent({}, 'length')));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }, 0);
        });
      },
    });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  });

  panelistQueue.push(
    () =>
      new Promise<Response>((resolve) => {
        void retryGate.then(() => {
          setTimeout(() => resolve(sseResponse(full)), 0);
        });
      }),
  );

  return { releaseFirstFinish, releaseRetry };
}

function messagesOf(body: Record<string, unknown>): string {
  return JSON.stringify(body.messages ?? []);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  moderatorQueue.length = 0;
  panelistQueue.length = 0;
  requestBodies.length = 0;

  saveSettings(SETTINGS);
  saveProfile(PROFILE);
  saveDocuments(DOCUMENTS);

  fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    requestBodies.push(body);
    const messages = messagesOf(body);

    // Panelist turns stream; moderator and note-taker calls are one-shot.
    if (body.stream === true) {
      const produce = panelistQueue.shift();
      if (!produce) {
        throw new Error('Test router: unexpected panelist stream request');
      }
      return produce();
    }
    if (messages.includes('Anda adalah moderator')) {
      const decision = moderatorQueue.shift() ?? {
        panelist: 'akademisi' as const,
        directive: 'Sapa kandidat dan minta ia memperkenalkan diri secara ringkas.',
      };
      return jsonResponse(JSON.stringify(decision));
    }
    if (messages.includes('Anda adalah notulen')) {
      return jsonResponse(
        JSON.stringify({
          dimensions: ['communication'],
          strengths: ['Jawaban runtut.'],
          weaknesses: [],
          quotes: [],
        }),
      );
    }
    throw new Error(`Test router: unrecognized LLM request: ${messages.slice(0, 120)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

/* ── Render harness ──────────────────────────────────────────────────────── */

let root: Root | null = null;
let container: HTMLElement | null = null;

async function renderScreen(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await React.act(async () => {
    root!.render(
      <I18nProvider>
        <InterviewScreen />
      </I18nProvider>,
    );
  });
  return container;
}

afterEach(async () => {
  if (root && container) {
    const mountedRoot = root;
    const mountedContainer = container;
    root = null;
    container = null;
    // Unmounting aborts any in-flight turn; gated promises that never
    // resolve can no longer touch the unmounted root.
    await React.act(async () => {
      mountedRoot.unmount();
    });
    mountedContainer.remove();
  }
  vi.unstubAllGlobals();
});

function screenText(): string {
  return container?.textContent ?? '';
}

/** Poll until `condition` holds, flushing React work on every iteration. */
async function waitFor(
  condition: () => boolean,
  description: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for: ${description}`);
    }
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

/** Icon-only composer buttons carry their label in `aria-label`. */
function ariaButton(label: string): HTMLButtonElement | null {
  return (
    (container?.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null) ??
    null
  );
}

async function click(element: HTMLElement): Promise<void> {
  await React.act(async () => {
    element.click();
  });
}

/** Drive a controlled value change through React's onChange. */
async function setTextareaValue(
  textarea: HTMLTextAreaElement,
  value: string,
): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  if (!setter) throw new Error('Textarea value setter is unavailable');
  await React.act(async () => {
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/* ── SpeechRecognition stub (jsdom has no Web Speech API) ────────────────── */

class FakeRecognition {
  static instances: FakeRecognition[] = [];

  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start(): void {
    /* the engine is driven by the test through onresult */
  }
  stop(): void {
    /* no final-result ceremony needed for these tests */
  }
  abort(): void {
    /* teardown hook */
  }
}

function speakFinal(recognition: FakeRecognition, chunk: string): void {
  recognition.onresult?.({
    resultIndex: 0,
    results: {
      length: 1,
      item: () => ({
        isFinal: true,
        length: 1,
        item: () => ({ transcript: chunk }),
      }),
    },
  });
}

/* ── Tests ───────────────────────────────────────────────────────────────── */

describe('interview screen ↔ use-interview ↔ llm wiring', () => {
  it('hands the floor from the moderator decision to the chosen panelist', async () => {
    // The moderator picks the Psikolog — deliberately not the opening phase
    // lead, so a broken handoff (falling back to the lead) is visible.
    moderatorQueue.push({
      panelist: 'psikolog',
      directive: 'UJI-DIREKTIF: gali motivasi kandidat memilih bidang ini.',
    });
    pushPanelistTurn('Halo Budi, apa yang memotivasi Anda melanjutkan studi?');

    await renderScreen();
    await waitFor(
      () => screenText().includes('apa yang memotivasi Anda melanjutkan studi?'),
      'the opening question in the transcript',
    );

    // The turn is attributed to the panelist the moderator chose.
    expect(screenText()).toContain('Psikolog');

    // Request sequence: one moderator decision, then one panelist stream.
    const moderatorBodies = requestBodies.filter((body) =>
      messagesOf(body).includes('Anda adalah moderator'),
    );
    const streamBodies = requestBodies.filter((body) => body.stream === true);
    expect(moderatorBodies).toHaveLength(1);
    expect(streamBodies).toHaveLength(1);

    // The moderator's directive reached the panelist prompt.
    expect(messagesOf(streamBodies[0]!)).toContain('UJI-DIREKTIF');

    // The streamed question was committed to the persisted transcript.
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEYS.session) ?? '{}',
    ) as { turns?: Array<{ speaker: string; text: string }> };
    expect(
      stored.turns?.some(
        (turn) =>
          turn.speaker === 'psikolog' &&
          turn.text === 'Halo Budi, apa yang memotivasi Anda melanjutkan studi?',
      ),
    ).toBe(true);
  });

  it('submits a voice transcript through the hook into the next panel turn', async () => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    FakeRecognition.instances.length = 0;

    pushPanelistTurn('Selamat datang. Silakan perkenalkan diri Anda.');
    moderatorQueue.push({
      panelist: 'akademisi',
      directive: 'Kejar rencana studi kandidat.',
    });
    pushPanelistTurn('Terima kasih. Apa inti rencana studi Anda?');

    try {
      await renderScreen();
      await waitFor(
        () => screenText().includes('Silakan perkenalkan diri Anda'),
        'the opening question',
      );

      // Unified composer (P1-11): the mic icon appears once voice support is
      // detected and the panel is idle.
      await waitFor(
        () => ariaButton('Mulai berbicara') !== null,
        'the composer mic button',
      );
      await click(ariaButton('Mulai berbicara')!);

      const recognition = FakeRecognition.instances.at(-1);
      expect(recognition).toBeDefined();
      // The mic follows the session language.
      expect(recognition?.lang).toBe('id-ID');

      // Speak one finalized chunk — no text is shown while the mic is open.
      await React.act(async () => {
        speakFinal(recognition!, 'rencana saya ingin belajar lebih dalam');
      });

      // Finish recording; the transcript opens editable for review (P1-6).
      const finishLabel = 'Selesai berbicara — tinjau transkrip sebelum kirim';
      await waitFor(() => {
        const finish = ariaButton(finishLabel);
        return finish !== null && !finish.disabled;
      }, 'an enabled finish button once words were captured');
      await click(ariaButton(finishLabel)!);

      await waitFor(
        () =>
          container?.querySelector('[aria-label="Transkrip jawaban suara"]') !== null,
        'the editable review transcript',
      );
      const textarea = container?.querySelector(
        '[aria-label="Transkrip jawaban suara"]',
      ) as HTMLTextAreaElement;
      expect(textarea.value).toContain('rencana saya ingin belajar lebih dalam');
      await setTextareaValue(textarea, 'Rencana saya ingin belajar lebih dalam.');

      await click(ariaButton('Kirim')!);

      // The submitted transcript triggers the next panel turn.
      await waitFor(
        () => screenText().includes('Apa inti rencana studi Anda?'),
        'the second panelist turn after the answer',
      );
      expect(screenText()).toContain('Rencana saya ingin belajar lebih dalam.');

      // …and the answer reached the moderator context of that next decision.
      const moderatorBodies = requestBodies.filter((body) =>
        messagesOf(body).includes('Anda adalah moderator'),
      );
      expect(moderatorBodies).toHaveLength(2);
      expect(messagesOf(moderatorBodies[1]!)).toContain('belajar lebih dalam');
    } finally {
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    }
  }, 15_000);

  it('resets the live streaming buffer when a truncated turn is retried', async () => {
    const partial = 'Pertanyaan yang terpotong di sini karena';
    const full = 'Silakan jelaskan rencana studi Anda secara lengkap.';
    const { releaseFirstFinish, releaseRetry } = pushTruncatedThenGatedRetry(
      partial,
      full,
    );

    await renderScreen();

    // The token-capped first attempt renders its partial text live.
    await waitFor(() => screenText().includes(partial), 'the partial truncated text');

    // Now the stream hits the token cap: llm fires onTruncationRetry, the
    // hook resets the live buffer, and the gated retry holds the reset state.
    releaseFirstFinish();
    await waitFor(() => !screenText().includes(partial), 'the buffer reset');
    expect(screenText()).toContain('sedang menyusun pertanyaan');

    // The retry went out with a doubled token budget.
    const streamBodies = requestBodies.filter((body) => body.stream === true);
    expect(streamBodies).toHaveLength(2);
    expect(streamBodies[0]?.max_tokens).toBe(1500);
    expect(streamBodies[1]?.max_tokens).toBe(3000);

    releaseRetry();
    await waitFor(() => screenText().includes(full), 'the regenerated full turn');

    // No duplicated seam from the abandoned partial stream.
    expect(screenText()).not.toContain('karena Silakan');

    // The committed turn is exactly the regenerated text.
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEYS.session) ?? '{}',
    ) as { turns?: Array<{ speaker: string; text: string }> };
    const panelistTurns = stored.turns?.filter((turn) => turn.speaker !== 'user') ?? [];
    expect(panelistTurns.at(-1)?.text).toBe(full);
  }, 20_000);
});
