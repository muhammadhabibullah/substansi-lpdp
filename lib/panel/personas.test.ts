/**
 * Prompt-assembly tests (M3-7).
 *
 * Per AGENTS.md we test how prompts are *constructed*, never model output.
 */

import { describe, expect, it } from 'vitest';

import {
  buildPanelistMessages,
  buildPanelistSystemPrompt,
  HISTORY_WINDOW,
  isPanelistId,
  PANELIST_IDS,
  panelistLabel,
  type PanelistPromptContext,
} from './personas';
import { EMPTY_PROFILE, type DocumentSet, type Profile, type TranscriptTurn } from '../types';

const profile: Profile = {
  ...EMPTY_PROFILE,
  name: 'Budi Santoso',
  jenjang: 'magister',
  tujuan: 'ln',
  universitas: 'University of Melbourne',
  prodi: 'Master of Public Health',
  loa: 'conditional',
  skema: 'reguler',
  bidang: 'epidemiologi lapangan',
  pekerjaan: 'Analis data di Dinas Kesehatan',
  englishSegments: true,
};

const documents: DocumentSet = {
  cv: {
    kind: 'cv',
    fileName: 'cv.pdf',
    source: 'upload',
    text: 'Pengalaman: koordinator surveilans 2021-2023.',
    charCount: 44,
    parsedAt: 0,
  },
  studyPlan: {
    kind: 'studyPlan',
    fileName: 'rencana.pdf',
    source: 'upload',
    text: 'Rencana studi: fokus pada pemodelan wabah dengue.',
    charCount: 48,
    parsedAt: 0,
  },
  essay: {
    kind: 'essay',
    fileName: 'esai.pdf',
    source: 'upload',
    text: 'Kontribusi: membangun sistem peringatan dini nasional.',
    charCount: 53,
    parsedAt: 0,
  },
};

function turn(over: Partial<TranscriptTurn>): TranscriptTurn {
  return {
    id: 't',
    speaker: 'user',
    text: 'jawaban',
    atMs: 0,
    phase: 'opening',
    lang: 'id',
    ...over,
  };
}

function context(over: Partial<PanelistPromptContext> = {}): PanelistPromptContext {
  return {
    panelist: 'akademisi',
    profile,
    documents,
    phase: 'studyPlan',
    history: [],
    directive: 'Gali kelayakan metodologi pemodelan wabah.',
    useEnglish: false,
    wrapUp: false,
    requestClosingStatement: false,
    remainingMinutes: 40,
    ...over,
  };
}

describe('panelist identity helpers', () => {
  it('recognises the three panelists', () => {
    expect(PANELIST_IDS).toEqual(['akademisi', 'psikolog', 'lpdp']);
    expect(isPanelistId('akademisi')).toBe(true);
    expect(isPanelistId('moderator')).toBe(false);
    expect(isPanelistId(null)).toBe(false);
  });

  it('labels each panelist', () => {
    expect(panelistLabel('akademisi')).toBe('Akademisi');
    expect(panelistLabel('psikolog')).toBe('Psikolog');
    expect(panelistLabel('lpdp')).toBe('Tim LPDP');
  });
});

describe('buildPanelistSystemPrompt', () => {
  it('derives the Akademisi persona from the applicant field', () => {
    const prompt = buildPanelistSystemPrompt(context());
    expect(prompt).toContain('epidemiologi lapangan');
    expect(prompt).toContain('Profesor');
  });

  it('includes the applicant profile facts', () => {
    const prompt = buildPanelistSystemPrompt(context());
    expect(prompt).toContain('Budi Santoso');
    expect(prompt).toContain('University of Melbourne');
    expect(prompt).toContain('Master of Public Health');
  });

  it('states the current phase and its goal', () => {
    const prompt = buildPanelistSystemPrompt(context({ phase: 'contribution' }));
    expect(prompt).toContain('Nasionalisme & rencana kontribusi');
  });

  it('fences all document excerpts (hard constraint #5)', () => {
    const prompt = buildPanelistSystemPrompt(context());
    expect(prompt).toContain('<dokumen');
    expect(prompt).toContain('</dokumen>');
    expect(prompt).toContain('KEAMANAN PROMPT');
    expect(prompt).toMatch(/DATA milik kandidat/);
  });

  it('routes only the relevant documents to each panelist', () => {
    const academic = buildPanelistSystemPrompt(context({ panelist: 'akademisi' }));
    expect(academic).toContain('pemodelan wabah dengue');
    expect(academic).not.toContain('peringatan dini nasional');

    const lpdp = buildPanelistSystemPrompt(context({ panelist: 'lpdp' }));
    expect(lpdp).toContain('peringatan dini nasional');
  });

  it('instructs one question per turn and forbids in-interview scoring', () => {
    const prompt = buildPanelistSystemPrompt(context());
    expect(prompt).toMatch(/SATU pertanyaan/);
    expect(prompt).toMatch(/JANGAN memberi umpan balik/);
  });

  it('switches the language instruction for English segments', () => {
    const indonesian = buildPanelistSystemPrompt(context({ useEnglish: false }));
    expect(indonesian).toMatch(/Bahasa Indonesia formal/);

    const english = buildPanelistSystemPrompt(context({ useEnglish: true }));
    expect(english).toMatch(/BAHASA INGGRIS/);
  });

  it('adds wrap-up pressure when time is nearly gone', () => {
    const prompt = buildPanelistSystemPrompt(context({ wrapUp: true }));
    expect(prompt).toMatch(/WAKTU HAMPIR HABIS/);
  });

  it('asks for a closing statement on the final turn', () => {
    const prompt = buildPanelistSystemPrompt(
      context({ phase: 'closing', requestClosingStatement: true }),
    );
    expect(prompt).toMatch(/closing statement/i);
  });

  it('notes the absence of documents rather than fencing nothing', () => {
    const prompt = buildPanelistSystemPrompt(context({ documents: {} }));
    expect(prompt).toContain('tidak menyertakan dokumen');
    // The security rules still reference the fence tag by name, but no actual
    // fenced document block is emitted.
    expect(prompt).not.toContain('<dokumen nama=');
    expect(prompt).not.toContain('</dokumen>');
  });

  it('reports remaining minutes for pacing', () => {
    const prompt = buildPanelistSystemPrompt(context({ remainingMinutes: 12 }));
    expect(prompt).toContain('12 menit');
  });

  it('gives each panelist a distinct persona', () => {
    const prompts = PANELIST_IDS.map((panelist) =>
      buildPanelistSystemPrompt(context({ panelist })),
    );
    expect(new Set(prompts).size).toBe(3);
    expect(prompts[1]).toMatch(/psikolog/i);
    expect(prompts[2]).toMatch(/LPDP\/Kementerian Keuangan/);
  });
});

describe('buildPanelistMessages', () => {
  it('starts with the system persona and ends with the moderator directive', () => {
    const messages = buildPanelistMessages(context());

    expect(messages[0]?.role).toBe('system');
    const last = messages.at(-1);
    expect(last?.role).toBe('system');
    expect(String(last?.content)).toContain('Gali kelayakan metodologi');
  });

  it('injects a seed user message when the transcript is empty', () => {
    const messages = buildPanelistMessages(context({ history: [] }));
    expect(messages[1]?.role).toBe('user');
    expect(String(messages[1]?.content)).toMatch(/memasuki ruang wawancara/);
  });

  it('maps the candidate to user and this panelist to assistant', () => {
    const messages = buildPanelistMessages(
      context({
        history: [
          turn({ id: 'q', speaker: 'akademisi', text: 'Pertanyaan saya.' }),
          turn({ id: 'a', speaker: 'user', text: 'Jawaban kandidat.' }),
        ],
      }),
    );

    const roles = messages.slice(1, 3).map((message) => message.role);
    expect(roles).toEqual(['assistant', 'user']);
  });

  it('labels other panelists so they read as context, not own voice', () => {
    const messages = buildPanelistMessages(
      context({
        panelist: 'akademisi',
        history: [turn({ id: 'x', speaker: 'lpdp', text: 'Pertanyaan LPDP.' })],
      }),
    );
    const relayed = messages.find(
      (message) =>
        message.role === 'user' && String(message.content).includes('Pertanyaan LPDP.'),
    );
    expect(String(relayed?.content)).toContain('[Tim LPDP berkata kepada kandidat]');
  });

  it('caps the transcript window', () => {
    const history = Array.from({ length: 40 }, (_, index) =>
      turn({ id: `t${index}`, text: `giliran ${index}` }),
    );
    const messages = buildPanelistMessages(context({ history }));

    // system + window + directive
    expect(messages.length).toBe(HISTORY_WINDOW + 2);
    // The window must be the most recent turns.
    expect(String(messages[1]?.content)).toContain(`giliran ${40 - HISTORY_WINDOW}`);
  });

  it('falls back to a generic directive when none is given', () => {
    const messages = buildPanelistMessages(context({ directive: '   ' }));
    expect(String(messages.at(-1)?.content)).toMatch(/Lanjutkan wawancara/);
  });

  it('produces a stable prompt structure (snapshot)', () => {
    const messages = buildPanelistMessages(
      context({
        history: [
          turn({ id: 'q1', speaker: 'akademisi', text: 'Jelaskan metodologi Anda.' }),
          turn({ id: 'a1', speaker: 'user', text: 'Saya memakai pemodelan SEIR.' }),
        ],
      }),
    );

    expect(
      messages.map((message) => ({
        role: message.role,
        length: String(message.content).length > 0,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "length": true,
          "role": "system",
        },
        {
          "length": true,
          "role": "assistant",
        },
        {
          "length": true,
          "role": "user",
        },
        {
          "length": true,
          "role": "system",
        },
      ]
    `);
  });
});
