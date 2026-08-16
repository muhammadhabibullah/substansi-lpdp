import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmError } from '../llm';
import { EMPTY_PROFILE, type LlmSettings, type TranscriptTurn } from '../types';

const completeJson = vi.hoisted(() => vi.fn());
vi.mock('../llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../llm')>();
  return { ...actual, completeJson };
});

import { annotateAnswer } from './notetaker';

const settings: LlmSettings = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'key',
  model: 'main-model',
  cheapModel: 'cheap-model',
  temperature: 0.7,
  presetId: '',
};

const profile = { ...EMPTY_PROFILE, name: 'Kandidat' };

function answer(text: string): TranscriptTurn {
  return {
    id: 'turn-1',
    speaker: 'user',
    phase: 'motivation',
    lang: 'id',
    text,
    atMs: 0,
  };
}

const VALID_NOTE = {
  dimensions: ['motivation'],
  strengths: ['Terstruktur dan konkret.'],
  weaknesses: [],
  quotes: ['saya ingin berkontribusi'],
};

const LONG_ANSWER =
  'Saya ingin melanjutkan studi karena bidang ini membutuhkan keahlian yang lebih dalam. ' +
  'Rencana saya setelah lulus adalah kembali dan membangun kapasitas di Indonesia.';

beforeEach(() => {
  completeJson.mockReset();
});

describe('annotateAnswer', () => {
  it('scores very short answers deterministically without an LLM call', async () => {
    const note = await annotateAnswer(
      { answer: answer('Singkat saja.'), question: 'Mengapa?', profile },
      settings,
    );
    expect(note?.weaknesses).toHaveLength(1);
    expect(completeJson).not.toHaveBeenCalled();
  });

  it('returns the cheap-tier note when the first call succeeds', async () => {
    completeJson.mockResolvedValueOnce(VALID_NOTE);
    const note = await annotateAnswer(
      { answer: answer(LONG_ANSWER), question: 'Mengapa?', profile },
      settings,
    );
    expect(note?.strengths).toEqual(['Terstruktur dan konkret.']);
    expect(completeJson).toHaveBeenCalledTimes(1);
    expect(completeJson.mock.calls[0]?.[0]).toMatchObject({ tier: 'cheap' });
  });

  it('falls back to the main tier when the cheap call fails', async () => {
    completeJson.mockRejectedValueOnce(new LlmError('bad-response', 'model not found'));
    completeJson.mockResolvedValueOnce(VALID_NOTE);
    const note = await annotateAnswer(
      { answer: answer(LONG_ANSWER), question: 'Mengapa?', profile },
      settings,
    );
    expect(note?.strengths).toEqual(['Terstruktur dan konkret.']);
    expect(completeJson).toHaveBeenCalledTimes(2);
    expect(completeJson.mock.calls[1]?.[0]).toMatchObject({ tier: 'main' });
  });

  it('does not retry on the main tier after an abort', async () => {
    completeJson.mockRejectedValueOnce(new LlmError('aborted', 'Request aborted'));
    const note = await annotateAnswer(
      { answer: answer(LONG_ANSWER), question: 'Mengapa?', profile },
      settings,
    );
    expect(note).toBeNull();
    expect(completeJson).toHaveBeenCalledTimes(1);
  });

  it('returns null only when both tiers fail', async () => {
    completeJson.mockRejectedValue(new LlmError('network', 'down'));
    const note = await annotateAnswer(
      { answer: answer(LONG_ANSWER), question: 'Mengapa?', profile },
      settings,
    );
    expect(note).toBeNull();
    expect(completeJson).toHaveBeenCalledTimes(2);
  });
});
