/**
 * lib/report.ts — grading and report assembly (PLAN §5, M4-2/M4-3).
 *
 * Three model calls, each with a deterministic fallback so a finished interview
 * always yields a report:
 *   1. score the 8 rubric dimensions from the note-taker evidence,
 *   2. write per-panelist in-character narratives,
 *   3. check the LPDP strong/weak signal checklist and draft next steps.
 *
 * Scoring maths lives in `lib/rubric.ts`; this module only prompts, validates,
 * and assembles.
 */

import { completeJson, type CoreMessage } from './llm';
import { getCopy, type Locale } from './i18n';
import {
  bandFor,
  buildDimensionResults,
  coerceScore,
  collectEvidence,
  DIMENSION_IDS,
  dimensionsOwnedBy,
  isDimensionId,
  RUBRIC,
  scoringNotesFor,
  totalScore,
  type RawDimensionScore,
} from './rubric';
import { PANELIST_IDS, panelistLabel } from './panel/personas';
import { PHASES } from './panel/phases';
import { createId } from './utils';
import type {
  AnswerNote,
  DimensionResult,
  InterviewSession,
  LlmSettings,
  PanelistId,
  PanelNote,
  PhaseId,
  Profile,
  Report,
  SignalCheck,
  SignalVerdict,
  TranscriptTurn,
} from './types';

/** Steps reported to the UI while the report is being built. */
export type ReportStep = 'scoring' | 'narrative' | 'signals';

export const REPORT_STEPS: readonly ReportStep[] = ['scoring', 'narrative', 'signals'];

export interface GenerateReportOptions {
  session: InterviewSession;
  settings: LlmSettings;
  locale: Locale;
  signal?: AbortSignal;
  onStep?: (step: ReportStep, index: number, total: number) => void;
}

/* ── Transcript rendering for prompts ────────────────────────────────────── */

/** Cap the transcript sent to the grader so long sessions still fit a context. */
const TRANSCRIPT_CHAR_BUDGET = 24_000;

function renderTranscript(turns: readonly TranscriptTurn[], budget: number): string {
  const lines = turns
    .filter((turn) => turn.speaker !== 'system')
    .map((turn) => {
      const who = turn.speaker === 'user' ? 'KANDIDAT' : panelistLabel(turn.speaker as PanelistId).toUpperCase();
      return `${who}: ${turn.text}`;
    });

  const joined = lines.join('\n\n');
  if (joined.length <= budget) return joined;

  // Keep the end of the interview (contribution + closing carry most weight).
  const kept: string[] = [];
  let used = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (used + line.length > budget) break;
    kept.unshift(line);
    used += line.length;
  }
  return `[…awal transkrip dipotong karena panjang…]\n\n${kept.join('\n\n')}`;
}

function renderEvidence(notes: readonly AnswerNote[]): string {
  const evidence = collectEvidence(notes);
  const blocks = DIMENSION_IDS.map((id) => {
    const bucket = evidence[id];
    const parts = [`## ${id}`];
    parts.push(
      bucket.strengths.length > 0
        ? `Kekuatan tercatat:\n${bucket.strengths.map((s) => `- ${s}`).join('\n')}`
        : 'Kekuatan tercatat: (tidak ada)',
    );
    parts.push(
      bucket.weaknesses.length > 0
        ? `Kelemahan tercatat:\n${bucket.weaknesses.map((w) => `- ${w}`).join('\n')}`
        : 'Kelemahan tercatat: (tidak ada)',
    );
    parts.push(
      bucket.quotes.length > 0
        ? `Kutipan verbatim:\n${bucket.quotes.map((q) => `- "${q}"`).join('\n')}`
        : 'Kutipan verbatim: (tidak ada)',
    );
    return parts.join('\n');
  });
  return blocks.join('\n\n');
}

function profileSummary(profile: Profile): string {
  return [
    `Nama: ${profile.name || '(tidak diisi)'}`,
    `Jenjang: ${profile.jenjang === 'doktor' ? 'Doktor' : 'Magister'}`,
    `Tujuan: ${profile.tujuan === 'ln' ? 'Luar negeri' : 'Dalam negeri'}`,
    `Universitas/prodi: ${profile.universitas || '-'} / ${profile.prodi || '-'}`,
    `Bidang: ${profile.bidang || '-'}`,
    `Skema: ${profile.skema}`,
    `Status LoA: ${profile.loa}`,
  ].join('\n');
}

/* ── Step 1: dimension scoring ───────────────────────────────────────────── */

const RUBRIC_SPEC_ID = RUBRIC.map(
  (dimension) => `- ${dimension.id} (bobot ${dimension.weight}, penilai ${dimension.owner})`,
).join('\n');

function buildScoringMessages(
  session: InterviewSession,
  transcript: string,
  evidence: string,
): CoreMessage[] {
  const overseas = session.profile.tujuan === 'ln';

  const system = [
    'Anda adalah ketua panel penilai Seleksi Substansi LPDP yang menyusun penilaian akhir.',
    'Anda menilai 8 dimensi rubrik, masing-masing dengan skor bilangan bulat 1–4.',
    '',
    'SKALA SKOR:',
    '1 = Kurang: jawaban normatif/kosong, tidak ada bukti, atau bertentangan dengan dokumen.',
    '2 = Cukup: ada arah tetapi masih umum, minim angka/contoh, atau goyah saat digali.',
    '3 = Baik: jelas, didukung contoh konkret, konsisten dengan dokumen.',
    '4 = Sangat baik: sangat spesifik, terukur, autentik, dan meyakinkan; tahan uji saat digali.',
    '',
    'DIMENSI YANG HARUS DINILAI (gunakan id persis, semua 8 wajib ada):',
    RUBRIC_SPEC_ID,
    '',
    scoringNotesFor(overseas),
    '',
    'ATURAN:',
    '1. Nilai HANYA dari transkrip dan catatan bukti. Jangan mengarang kutipan atau fakta.',
    '2. "quotes" wajib VERBATIM dari ucapan kandidat di transkrip. Jika tidak ada yang relevan, kosongkan array.',
    '3. Jika suatu dimensi hampir tidak teruji karena wawancara pendek, beri skor 2 dan jelaskan bahwa buktinya minim.',
    '4. Jangan menaikkan skor karena kandidat sopan atau bersemangat saja — yang dinilai adalah substansi dan kekonkretan.',
    '5. "justification" 1–3 kalimat, Bahasa Indonesia, menyebut alasan konkret.',
    '6. "improvements" harus dapat langsung dikerjakan (misalnya "sebutkan target jumlah penerima manfaat dan tenggat waktunya").',
    '',
    'FORMAT KELUARAN: JSON mentah saja.',
    '{"dimensions":[{"id":"studyPlan","score":3,"justification":"...","quotes":["..."],"strengths":["..."],"improvements":["..."]}]}',
  ].join('\n');

  const user = [
    'PROFIL KANDIDAT:',
    profileSummary(session.profile),
    '',
    `TAHAP YANG TERCAPAI: ${uniquePhases(session.turns).join(', ') || '(tidak ada)'}`,
    `JUMLAH JAWABAN KANDIDAT: ${countAnswers(session.turns)}`,
    `DURASI WAWANCARA: ${Math.round(session.elapsedMs / 60_000)} menit`,
    '',
    'CATATAN BUKTI PER DIMENSI (dari notulen selama wawancara):',
    evidence,
    '',
    'TRANSKRIP WAWANCARA:',
    transcript,
    '',
    'Nilai kedelapan dimensi sekarang. Balas dengan JSON saja.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function parseScores(value: unknown): RawDimensionScore[] {
  if (typeof value !== 'object' || value === null) {
    throw new Error('scoring response was not an object');
  }
  const record = value as Record<string, unknown>;
  const list = Array.isArray(record.dimensions) ? record.dimensions : [];
  if (list.length === 0) throw new Error('scoring response had no dimensions');

  const out: RawDimensionScore[] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    if (!isDimensionId(item.id)) continue;
    out.push({
      id: item.id,
      score: coerceScore(item.score),
      justification: typeof item.justification === 'string' ? item.justification : '',
      quotes: stringArray(item.quotes, 4, 400),
      strengths: stringArray(item.strengths, 4, 240),
      improvements: stringArray(item.improvements, 4, 240),
    });
  }
  if (out.length === 0) throw new Error('scoring response had no valid dimensions');
  return out;
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
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

/**
 * Deterministic scoring used when the model call fails: derive scores from the
 * note-taker evidence balance so the report still reflects the session.
 */
export function fallbackScores(notes: readonly AnswerNote[]): RawDimensionScore[] {
  const evidence = collectEvidence(notes);
  return DIMENSION_IDS.map((id) => {
    const bucket = evidence[id];
    const strengths = bucket.strengths.length;
    const weaknesses = bucket.weaknesses.length;

    let score = 2;
    if (strengths === 0 && weaknesses === 0) score = 2;
    else if (strengths > weaknesses * 2) score = 4;
    else if (strengths > weaknesses) score = 3;
    else if (weaknesses > strengths * 2) score = 1;
    else score = 2;

    return {
      id,
      score: coerceScore(score),
      justification:
        strengths === 0 && weaknesses === 0
          ? 'Dimensi ini hampir tidak teruji selama wawancara sehingga bukti yang tersedia minim.'
          : 'Skor disusun otomatis dari catatan notulen karena penilaian model tidak tersedia.',
      quotes: bucket.quotes.slice(0, 3),
      strengths: bucket.strengths.slice(0, 3),
      improvements: bucket.weaknesses.slice(0, 3),
    };
  });
}

/* ── Step 2: per-panelist narratives ─────────────────────────────────────── */

function buildNarrativeMessages(
  session: InterviewSession,
  dimensions: readonly DimensionResult[],
  transcript: string,
): CoreMessage[] {
  const scoreLines = dimensions
    .map((dimension) => `- ${dimension.id}: ${dimension.score}/4 — ${dimension.justification}`)
    .join('\n');

  const ownership = PANELIST_IDS.map((panelist) => {
    const owned = dimensionsOwnedBy(panelist).map((d) => d.id);
    return `- ${panelist} (${panelistLabel(panelist)}): ${owned.join(', ')}`;
  }).join('\n');

  const system = [
    'Anda menulis catatan penilaian akhir dari tiga pewawancara panel Seleksi Substansi LPDP.',
    'Setiap pewawancara menulis dalam karakter masing-masing, langsung kepada kandidat ("Anda").',
    '',
    'PEMBAGIAN DIMENSI:',
    ownership,
    '',
    'ATURAN:',
    '1. Setiap narasi 4–7 kalimat, Bahasa Indonesia, jujur dan spesifik.',
    '2. Sebut hal konkret yang kandidat katakan. Pola yang wajib dipakai minimal sekali: "saat ditanya X, jawaban Anda Y — sebaiknya Z".',
    '3. Jangan mengarang. Jika bukti minim, katakan bahwa aspek itu belum tergali dan apa yang perlu dipersiapkan.',
    '4. Karakter: akademisi = presisi dan menuntut kedalaman; psikolog = hangat namun jeli pada pola dan konsistensi; lpdp = formal, tegas soal komitmen dan kekonkretan kontribusi.',
    '5. Jangan menyebut skor angka di dalam narasi.',
    '',
    'FORMAT KELUARAN: JSON mentah saja.',
    '{"notes":[{"panelist":"akademisi","narrative":"..."},{"panelist":"psikolog","narrative":"..."},{"panelist":"lpdp","narrative":"..."}]}',
  ].join('\n');

  const user = [
    'PROFIL KANDIDAT:',
    profileSummary(session.profile),
    '',
    'SKOR YANG SUDAH DITETAPKAN:',
    scoreLines,
    '',
    'TRANSKRIP WAWANCARA:',
    transcript,
    '',
    'Tulis ketiga catatan pewawancara sekarang. Balas dengan JSON saja.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function parseNarratives(value: unknown): PanelNote[] {
  if (typeof value !== 'object' || value === null) {
    throw new Error('narrative response was not an object');
  }
  const record = value as Record<string, unknown>;
  const list = Array.isArray(record.notes) ? record.notes : [];

  const byPanelist = new Map<PanelistId, string>();
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const panelist = item.panelist;
    const narrative = item.narrative;
    if (
      typeof panelist === 'string' &&
      (PANELIST_IDS as readonly string[]).includes(panelist) &&
      typeof narrative === 'string' &&
      narrative.trim().length > 0
    ) {
      byPanelist.set(panelist as PanelistId, narrative.trim());
    }
  }
  if (byPanelist.size === 0) throw new Error('narrative response had no usable notes');

  return PANELIST_IDS.map((panelist) => ({
    panelist,
    narrative: byPanelist.get(panelist) ?? '',
  })).filter((note) => note.narrative.length > 0);
}

/** Assemble narratives from dimension justifications when the model fails. */
function fallbackNarratives(
  dimensions: readonly DimensionResult[],
  locale: Locale,
): PanelNote[] {
  const copy = getCopy(locale);
  return PANELIST_IDS.map((panelist) => {
    const owned = dimensionsOwnedBy(panelist).map((d) => d.id);
    const relevant = dimensions.filter((dimension) => owned.includes(dimension.id));
    const lines = relevant.map((dimension) => {
      const name = copy.rubric[dimension.id].name;
      return `${name}: ${dimension.score}/4. ${dimension.justification}`;
    });
    const improvements = relevant.flatMap((dimension) => dimension.improvements).slice(0, 3);
    return {
      panelist,
      narrative: [
        ...lines,
        improvements.length > 0
          ? `Yang perlu Anda perbaiki: ${improvements.join('; ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    };
  });
}

/* ── Step 3: signal checklist + next steps ───────────────────────────────── */

function buildSignalsMessages(
  session: InterviewSession,
  transcript: string,
  locale: Locale,
): CoreMessage[] {
  const copy = getCopy(locale);
  const strongList = copy.signals.strong
    .map((label, index) => `${index}: ${label}`)
    .join('\n');
  const weakList = copy.signals.weak.map((label, index) => `${index}: ${label}`).join('\n');

  const system = [
    'Anda memeriksa transkrip wawancara Seleksi Substansi LPDP terhadap daftar indikator resmi kandidat kuat dan kandidat lemah.',
    '',
    'INDIKATOR KANDIDAT KUAT (index: deskripsi):',
    strongList,
    '',
    'INDIKATOR KANDIDAT LEMAH (index: deskripsi):',
    weakList,
    '',
    'ATURAN:',
    '1. Untuk setiap indikator kuat, tentukan verdict: "present" (jelas terlihat), "partial" (ada sedikit), atau "absent" (tidak terlihat).',
    '2. Untuk setiap indikator lemah, verdict "present" berarti kelemahan itu TERDETEKSI; "absent" berarti tidak terdeteksi.',
    '3. "note" maksimal 20 kata, menyebut bukti konkret dari transkrip.',
    '4. Jujur dan jangan murah hati. Jika transkrip pendek, banyak indikator memang "absent".',
    '5. "nextSteps": 4–6 langkah perbaikan paling berdampak. Harus operasional dan spesifik, misalnya menyebut angka, tenggat, atau materi yang perlu disiapkan.',
    '',
    'FORMAT KELUARAN: JSON mentah saja.',
    '{"strong":[{"index":0,"verdict":"present","note":"..."}],"weak":[{"index":0,"verdict":"absent","note":"..."}],"nextSteps":["..."]}',
  ].join('\n');

  const user = [
    'PROFIL KANDIDAT:',
    profileSummary(session.profile),
    '',
    'TRANSKRIP WAWANCARA:',
    transcript,
    '',
    'Periksa semua indikator dan susun langkah perbaikan. Balas dengan JSON saja.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

interface SignalsResult {
  strong: SignalCheck[];
  weak: SignalCheck[];
  nextSteps: string[];
}

function isVerdict(value: unknown): value is SignalVerdict {
  return value === 'present' || value === 'partial' || value === 'absent';
}

function parseSignalList(value: unknown, count: number): SignalCheck[] {
  if (!Array.isArray(value)) return [];
  const byIndex = new Map<number, SignalCheck>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const index =
      typeof item.index === 'number' ? item.index : Number.parseInt(String(item.index), 10);
    if (!Number.isInteger(index) || index < 0 || index >= count) continue;
    byIndex.set(index, {
      index,
      verdict: isVerdict(item.verdict) ? item.verdict : 'absent',
      note: typeof item.note === 'string' ? item.note.trim().slice(0, 200) : '',
    });
  }
  // Always return an entry per indicator so the report table is complete.
  return Array.from({ length: count }, (_, index) =>
    byIndex.get(index) ?? { index, verdict: 'absent' as SignalVerdict, note: '' },
  );
}

function parseSignals(value: unknown, locale: Locale): SignalsResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('signals response was not an object');
  }
  const record = value as Record<string, unknown>;
  const copy = getCopy(locale);

  const nextSteps = stringArray(record.nextSteps, 6, 300);
  if (nextSteps.length === 0) throw new Error('signals response had no next steps');

  return {
    strong: parseSignalList(record.strong, copy.signals.strong.length),
    weak: parseSignalList(record.weak, copy.signals.weak.length),
    nextSteps,
  };
}

function fallbackSignals(
  dimensions: readonly DimensionResult[],
  locale: Locale,
): SignalsResult {
  const copy = getCopy(locale);
  const nextSteps = dimensions
    .slice()
    .sort((a, b) => a.score - b.score)
    .flatMap((dimension) =>
      dimension.improvements.length > 0
        ? dimension.improvements.slice(0, 1)
        : [`Persiapkan bukti dan contoh konkret untuk: ${copy.rubric[dimension.id].name}.`],
    )
    .slice(0, 5);

  return {
    strong: Array.from({ length: copy.signals.strong.length }, (_, index) => ({
      index,
      verdict: 'absent' as SignalVerdict,
      note: '',
    })),
    weak: Array.from({ length: copy.signals.weak.length }, (_, index) => ({
      index,
      verdict: 'absent' as SignalVerdict,
      note: '',
    })),
    nextSteps,
  };
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function countAnswers(turns: readonly TranscriptTurn[]): number {
  return turns.filter((turn) => turn.speaker === 'user').length;
}

export function uniquePhases(turns: readonly TranscriptTurn[]): PhaseId[] {
  const seen = new Set<PhaseId>();
  for (const turn of turns) seen.add(turn.phase);
  // Return in canonical interview order, not first-seen order.
  return PHASES.map((phase) => phase.id).filter((id) => seen.has(id));
}

/* ── Orchestration ───────────────────────────────────────────────────────── */

/**
 * Build the full report. Each step degrades to a deterministic fallback rather
 * than failing, because the candidate has already spent up to an hour.
 */
export async function generateReport(options: GenerateReportOptions): Promise<Report> {
  const { session, settings, locale, signal } = options;
  const transcript = renderTranscript(session.turns, TRANSCRIPT_CHAR_BUDGET);
  const evidence = renderEvidence(session.notes);
  const total = REPORT_STEPS.length;

  // Step 1 — scores.
  options.onStep?.('scoring', 1, total);
  let rawScores: RawDimensionScore[];
  try {
    rawScores = await completeJson({
      settings,
      messages: buildScoringMessages(session, transcript, evidence),
      tier: 'main',
      temperature: 0.2,
      maxTokens: 2600,
      signal,
      validate: parseScores,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    rawScores = fallbackScores(session.notes);
  }

  const dimensions = buildDimensionResults(
    rawScores,
    'Bukti yang tersedia untuk dimensi ini terbatas.',
  );
  const total100 = totalScore(dimensions);

  // Step 2 — narratives.
  options.onStep?.('narrative', 2, total);
  let panelNotes: PanelNote[];
  try {
    panelNotes = await completeJson({
      settings,
      messages: buildNarrativeMessages(session, dimensions, transcript),
      tier: 'main',
      temperature: 0.6,
      maxTokens: 1800,
      signal,
      validate: parseNarratives,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    panelNotes = fallbackNarratives(dimensions, locale);
  }

  // Step 3 — signals + next steps.
  options.onStep?.('signals', 3, total);
  let signals: SignalsResult;
  try {
    signals = await completeJson({
      settings,
      messages: buildSignalsMessages(session, transcript, locale),
      tier: 'main',
      temperature: 0.3,
      maxTokens: 2200,
      signal,
      validate: (value) => parseSignals(value, locale),
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    signals = fallbackSignals(dimensions, locale);
  }

  return {
    id: createId('report'),
    sessionId: session.id,
    createdAt: Date.now(),
    locale,
    profile: session.profile,
    model: session.model,
    durationMs: session.elapsedMs,
    phasesCovered: uniquePhases(session.turns),
    answerCount: countAnswers(session.turns),
    totalScore: total100,
    band: bandFor(total100),
    dimensions,
    panelNotes,
    strongSignals: signals.strong,
    weakSignals: signals.weak,
    nextSteps: signals.nextSteps,
    turns: session.turns,
  };
}

function isAbort(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { kind?: unknown }).kind === 'aborted'
  );
}
