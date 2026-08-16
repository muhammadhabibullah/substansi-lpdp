/**
 * lib/panel/notetaker.ts — silent per-answer annotation (PLAN §3, M4-1).
 *
 * After each candidate answer, a cheap call records strengths, weaknesses, and
 * verbatim quotes tagged with rubric dimensions. The report is then assembled
 * from these notes instead of re-reading the whole transcript, so evidence stays
 * specific and grading stays cheap.
 *
 * This never blocks the interview: failures resolve to `null` and the caller
 * simply carries on.
 */

import { completeJson, toLlmError, type CoreMessage } from '../llm';
import { DIMENSION_IDS, isDimensionId } from '../rubric';
import type {
  AnswerNote,
  DimensionId,
  LlmSettings,
  PhaseId,
  Profile,
  TranscriptTurn,
} from '../types';

/** Dimensions each phase can plausibly produce evidence for. */
const PHASE_DIMENSION_HINTS: Record<PhaseId, DimensionId[]> = {
  opening: ['communication', 'motivation'],
  motivation: ['motivation', 'fieldMastery', 'communication', 'consistency'],
  studyPlan: ['studyPlan', 'fieldMastery', 'communication', 'consistency'],
  personality: ['resilience', 'motivation', 'consistency'],
  contribution: ['nationalism', 'contribution', 'consistency'],
  closing: ['communication', 'motivation', 'contribution'],
};

export interface NoteTakerContext {
  /** The candidate's answer being annotated. */
  answer: TranscriptTurn;
  /** The panelist question that prompted it, if any. */
  question: string;
  profile: Profile;
}

function buildMessages(context: NoteTakerContext): CoreMessage[] {
  const hints = PHASE_DIMENSION_HINTS[context.answer.phase] ?? DIMENSION_IDS;

  const system = [
    'Anda adalah notulen penilai dalam panel Seleksi Substansi LPDP. Anda tidak berbicara kepada kandidat.',
    'Tugas Anda: mencatat penilaian singkat atas SATU jawaban kandidat, sebagai bahan bukti untuk laporan akhir.',
    '',
    'DIMENSI PENILAIAN YANG TERSEDIA (gunakan id-nya secara persis):',
    '- studyPlan: rencana studi/riset & kesiapan akademik',
    '- fieldMastery: penguasaan bidang & kesesuaian prodi-karier',
    '- communication: kemampuan komunikasi (dan bahasa Inggris jika jawaban berbahasa Inggris)',
    '- motivation: motivasi & autentisitas',
    '- resilience: kepribadian, resiliensi & kesiapan psikologis',
    '- consistency: konsistensi jawaban vs dokumen',
    '- nationalism: nasionalisme & komitmen kembali ke Indonesia',
    '- contribution: rencana kontribusi konkret & terukur',
    '',
    'ATURAN:',
    '1. Nilai HANYA berdasarkan jawaban yang diberikan. Jangan mengarang fakta.',
    '2. "quotes" harus kutipan VERBATIM dari jawaban kandidat (maksimal 25 kata per kutipan). Jangan parafrase, jangan mengubah kata.',
    '3. Jika jawaban terlalu pendek atau tidak substantif, kembalikan array kosong untuk strengths dan/atau quotes.',
    '4. Pilih 1–3 dimensi yang paling relevan dengan jawaban ini.',
    '5. Kekuatan/kelemahan ditulis singkat (maksimal 20 kata), spesifik, dan dalam Bahasa Indonesia.',
    '6. Kriteria kandidat kuat: terstruktur, contoh konkret, terukur, autentik. Kriteria lemah: normatif, umum, tanpa angka, terdengar hafalan, promosi diri tanpa bukti.',
    '',
    `DIMENSI YANG PALING MUNGKIN RELEVAN PADA TAHAP INI: ${hints.join(', ')}`,
    '',
    'FORMAT KELUARAN: JSON mentah saja, tanpa markdown, tanpa penjelasan:',
    '{"dimensions":["motivation"],"strengths":["..."],"weaknesses":["..."],"quotes":["..."]}',
  ].join('\n');

  const user = [
    `TAHAP: ${context.answer.phase}`,
    `BAHASA JAWABAN: ${context.answer.lang === 'en' ? 'Inggris' : 'Indonesia'}`,
    '',
    'PERTANYAAN PEWAWANCARA:',
    context.question || '(tidak tercatat)',
    '',
    'JAWABAN KANDIDAT:',
    context.answer.text,
    '',
    'Catat penilaian Anda sebagai JSON.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function toStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, maxLength));
    if (out.length >= maxItems) break;
  }
  return out;
}

function parseNote(value: unknown, context: NoteTakerContext): AnswerNote {
  if (typeof value !== 'object' || value === null) {
    throw new Error('note-taker response was not an object');
  }
  const record = value as Record<string, unknown>;

  const dimensions = Array.isArray(record.dimensions)
    ? record.dimensions.filter(isDimensionId).slice(0, 3)
    : [];

  return {
    turnId: context.answer.id,
    question: context.question,
    phase: context.answer.phase,
    // Fall back to the phase's likely dimensions so evidence is never orphaned.
    dimensions:
      dimensions.length > 0
        ? dimensions
        : (PHASE_DIMENSION_HINTS[context.answer.phase] ?? []).slice(0, 2),
    strengths: toStringArray(record.strengths, 4, 200),
    weaknesses: toStringArray(record.weaknesses, 4, 200),
    quotes: toStringArray(record.quotes, 3, 300),
  };
}

/** Answers shorter than this are not worth an annotation call. */
const MIN_ANSWER_CHARS = 40;

/**
 * Token budget for one annotation. Generous on purpose: reasoning models
 * (`gpt-5*`, `o*`) charge their thinking against `max_completion_tokens`, so a
 * tight budget truncates the JSON and makes every annotation fail.
 */
const NOTE_MAX_TOKENS = 1500;

/**
 * Annotate one candidate answer. Tries the cheap model first and falls back to
 * the main model when the cheap call fails (bad model id, weak JSON
 * compliance, truncation), returning `null` only when both do — the interview
 * must continue regardless.
 */
export async function annotateAnswer(
  context: NoteTakerContext,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<AnswerNote | null> {
  if (context.answer.text.trim().length < MIN_ANSWER_CHARS) {
    return {
      turnId: context.answer.id,
      question: context.question,
      phase: context.answer.phase,
      dimensions: ['communication'],
      strengths: [],
      weaknesses: ['Jawaban sangat singkat dan tidak mengembangkan substansi.'],
      quotes: [],
    };
  }

  const messages = buildMessages(context);
  const validate = (value: unknown) => parseNote(value, context);

  try {
    return await completeJson({
      settings,
      messages,
      tier: 'cheap',
      temperature: 0.2,
      maxTokens: NOTE_MAX_TOKENS,
      signal,
      validate,
    });
  } catch (error) {
    // An intentional cancel stays silent; anything else earns one retry on the
    // main model, which is the one already proven to work during the session.
    if (toLlmError(error).kind === 'aborted') return null;
  }

  try {
    return await completeJson({
      settings,
      messages,
      tier: 'main',
      temperature: 0.2,
      maxTokens: NOTE_MAX_TOKENS,
      signal,
      validate,
    });
  } catch {
    // Silent by design: the UI shows a soft warning, grading degrades slightly.
    return null;
  }
}
