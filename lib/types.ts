/**
 * lib/types.ts — shared domain types.
 *
 * These describe the data that lives in the browser: the applicant profile,
 * parsed documents, the interview transcript, and the grading report. They are
 * also the persisted `localStorage` shapes, so changes need a schema version
 * bump in `lib/storage.ts`.
 */

import type { Locale } from './i18n';

/* ── Applicant profile (PLAN §4) ─────────────────────────────────────────── */

export type Jenjang = 'magister' | 'doktor';
export type Tujuan = 'dn' | 'ln';
export type LoaStatus = 'unconditional' | 'conditional' | 'none';
export type Skema = 'reguler' | 'ptud' | 'afirmasi' | 'targeted';

export interface Profile {
  name: string;
  jenjang: Jenjang;
  tujuan: Tujuan;
  universitas: string;
  prodi: string;
  loa: LoaStatus;
  skema: Skema;
  bidang: string;
  pekerjaan: string;
  /** Whether the panel may switch to English mid-interview. */
  englishSegments: boolean;
}

export const EMPTY_PROFILE: Profile = {
  name: '',
  jenjang: 'magister',
  tujuan: 'dn',
  universitas: '',
  prodi: '',
  loa: 'none',
  skema: 'reguler',
  bidang: '',
  pekerjaan: '',
  englishSegments: false,
};

/* ── Documents (PLAN §4) ─────────────────────────────────────────────────── */

/**
 * Document slots. `studyPlan` applies to Magister and `proposal` to Doktor;
 * only the slot matching the applicant's jenjang is required.
 */
export type DocKind = 'cv' | 'studyPlan' | 'proposal' | 'essay';

export const DOC_KINDS: readonly DocKind[] = [
  'cv',
  'studyPlan',
  'proposal',
  'essay',
] as const;

export type DocSource = 'upload' | 'paste';

export interface ParsedDoc {
  kind: DocKind;
  /** Original filename for uploads; empty for pasted text. */
  fileName: string;
  source: DocSource;
  /** Extracted plain text. Never raw file bytes. */
  text: string;
  charCount: number;
  /** Page count when the parser knows it (PDF). */
  pageCount?: number;
  parsedAt: number;
  /** Set when the text exceeded the per-doc limit and was condensed. */
  truncated?: boolean;
}

export type DocumentSet = Partial<Record<DocKind, ParsedDoc>>;

/* ── LLM settings (PLAN §3, BYOK) ────────────────────────────────────────── */

export interface LlmSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Optional cheaper model for moderator + note-taker steps. */
  cheapModel: string;
  temperature: number;
  presetId: string;
}

/* ── Interview transcript ────────────────────────────────────────────────── */

export type PanelistId = 'akademisi' | 'psikolog' | 'lpdp';
export type SpeakerId = PanelistId | 'user' | 'system';

export type PhaseId =
  | 'opening'
  | 'motivation'
  | 'studyPlan'
  | 'personality'
  | 'contribution'
  | 'closing';

export interface TranscriptTurn {
  id: string;
  speaker: SpeakerId;
  text: string;
  /** Wall-clock ms since the interview started. */
  atMs: number;
  phase: PhaseId;
  /** Language the turn was spoken in. */
  lang: Locale;
}

/** Rubric dimension ids (PLAN §5). */
export type DimensionId =
  | 'studyPlan'
  | 'fieldMastery'
  | 'communication'
  | 'motivation'
  | 'resilience'
  | 'consistency'
  | 'nationalism'
  | 'contribution';

/**
 * A note-taker annotation for a single user answer — the evidence pool the
 * final report draws from (PLAN §3).
 */
export interface AnswerNote {
  /** `TranscriptTurn.id` of the user answer being annotated. */
  turnId: string;
  /** Question that prompted the answer, for report context. */
  question: string;
  phase: PhaseId;
  dimensions: DimensionId[];
  strengths: string[];
  weaknesses: string[];
  /** Verbatim quotes lifted from the user's answer. */
  quotes: string[];
}

export type InterviewStatus =
  | 'preparing'
  | 'running'
  | 'wrapping'
  | 'finished'
  | 'aborted';

export interface InterviewSession {
  id: string;
  startedAt: number;
  /** Accumulated elapsed interview time in ms (survives reloads). */
  elapsedMs: number;
  /** Timestamp of the last elapsed-time checkpoint, when running. */
  tickedAt: number;
  status: InterviewStatus;
  phase: PhaseId;
  /** Elapsed ms at which the current phase started. */
  phaseStartedMs: number;
  turns: TranscriptTurn[];
  notes: AnswerNote[];
  /** Panelist that spoke last, so the moderator can vary speakers. */
  lastSpeaker: PanelistId | null;
  /** Current interview language, which the panel follows. */
  lang: Locale;
  /** Snapshot of profile/settings the session was started with. */
  profile: Profile;
  model: string;
  finishedAt?: number;
}

/* ── Report (PLAN §5) ────────────────────────────────────────────────────── */

export type BandId = 'sangat' | 'direkomendasikan' | 'dipertimbangkan' | 'belum';

/**
 * 0–4 (PLAN §5). 0 means there was nothing to grade — no evidence in the
 * transcript nor in the candidate's documents (e.g. abandoned sessions).
 */
export type Score = 0 | 1 | 2 | 3 | 4;

export interface DimensionResult {
  id: DimensionId;
  score: Score;
  /** Weighted contribution to the /100 total. */
  weighted: number;
  justification: string;
  quotes: string[];
  strengths: string[];
  improvements: string[];
}

export type SignalVerdict = 'present' | 'partial' | 'absent';

export interface SignalCheck {
  /** Index into the i18n `signals.strong` / `signals.weak` arrays. */
  index: number;
  verdict: SignalVerdict;
  note: string;
}

export interface PanelNote {
  panelist: PanelistId;
  narrative: string;
}

export interface Report {
  id: string;
  sessionId: string;
  createdAt: number;
  locale: Locale;
  profile: Profile;
  model: string;
  durationMs: number;
  phasesCovered: PhaseId[];
  answerCount: number;
  totalScore: number;
  band: BandId;
  dimensions: DimensionResult[];
  panelNotes: PanelNote[];
  strongSignals: SignalCheck[];
  weakSignals: SignalCheck[];
  nextSteps: string[];
  /** Transcript copy so the report stands alone. */
  turns: TranscriptTurn[];
}
