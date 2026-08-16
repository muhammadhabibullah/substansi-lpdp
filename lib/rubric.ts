/**
 * lib/rubric.ts — the grading rubric (PLAN §5 is the spec; these tables must
 * match it exactly).
 *
 * Eight dimensions, each scored 0–4, weighted to a /100 total, then mapped onto
 * a recommendation band. 0 is reserved for dimensions with nothing to grade
 * (no transcript evidence and nothing in the candidate's documents).
 * All maths here is pure and unit-tested.
 */

import type {
  AnswerNote,
  BandId,
  DimensionId,
  DimensionResult,
  PanelistId,
  Score,
} from './types';

export interface RubricDimension {
  id: DimensionId;
  /** Weight out of 100 (PLAN §5). */
  weight: number;
  /** Panelist who owns the dimension. */
  owner: PanelistId;
  /** Only scored when the applicant is going overseas. */
  overseasSensitive?: boolean;
}

/** PLAN §5 — weights sum to 100. */
export const RUBRIC: readonly RubricDimension[] = [
  { id: 'studyPlan', weight: 20, owner: 'akademisi' },
  { id: 'fieldMastery', weight: 10, owner: 'akademisi' },
  { id: 'communication', weight: 10, owner: 'akademisi', overseasSensitive: true },
  { id: 'motivation', weight: 10, owner: 'psikolog' },
  { id: 'resilience', weight: 10, owner: 'psikolog' },
  { id: 'consistency', weight: 10, owner: 'psikolog' },
  { id: 'nationalism', weight: 15, owner: 'lpdp' },
  { id: 'contribution', weight: 15, owner: 'lpdp' },
] as const;

export const DIMENSION_IDS: readonly DimensionId[] = RUBRIC.map((d) => d.id);

export const TOTAL_WEIGHT = RUBRIC.reduce((sum, d) => sum + d.weight, 0);

/** Lowest score a tested dimension can receive. */
export const MIN_SCORE = 1;
export const MAX_SCORE = 4;
/** Absolute floor: 0 means there was nothing to grade at all. */
export const UNSCORED = 0;

export function getDimension(id: DimensionId): RubricDimension {
  const found = RUBRIC.find((dimension) => dimension.id === id);
  if (!found) throw new Error(`Unknown rubric dimension: ${id}`);
  return found;
}

export function isDimensionId(value: unknown): value is DimensionId {
  return typeof value === 'string' && DIMENSION_IDS.includes(value as DimensionId);
}

/** Coerce arbitrary model output into a valid 0–4 score. */
export function coerceScore(value: unknown): Score {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return 2;
  const rounded = Math.round(numeric);
  if (rounded < UNSCORED) return UNSCORED;
  if (rounded > MAX_SCORE) return MAX_SCORE;
  return rounded as Score;
}

/**
 * Weighted points a dimension contributes to the /100 total.
 *
 * A score of 1 is the floor, not zero: `(score - 1) / 3 * weight`. A candidate
 * scoring all 1s gets 0/100 and all 4s gets 100/100. A 0 (nothing to grade)
 * likewise contributes zero points.
 */
export function weightedPoints(score: Score, weight: number): number {
  const normalized = Math.max(0, (score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE));
  return normalized * weight;
}

/** Sum dimension results into a /100 total, rounded to a whole number. */
export function totalScore(results: readonly DimensionResult[]): number {
  const sum = results.reduce((acc, result) => acc + result.weighted, 0);
  return Math.round(clampScore(sum));
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/* ── Bands (PLAN §5) ─────────────────────────────────────────────────────── */

export interface BandDefinition {
  id: BandId;
  /** Inclusive lower bound of the /100 total. */
  min: number;
}

export const BANDS: readonly BandDefinition[] = [
  { id: 'sangat', min: 85 },
  { id: 'direkomendasikan', min: 70 },
  { id: 'dipertimbangkan', min: 55 },
  { id: 'belum', min: 0 },
] as const;

export function bandFor(total: number): BandId {
  const clamped = clampScore(total);
  for (const band of BANDS) {
    if (clamped >= band.min) return band.id;
  }
  return 'belum';
}

/** Tailwind classes for band presentation in the report. */
export function bandTone(band: BandId): 'success' | 'default' | 'warning' | 'destructive' {
  switch (band) {
    case 'sangat':
      return 'success';
    case 'direkomendasikan':
      return 'default';
    case 'dipertimbangkan':
      return 'warning';
    case 'belum':
      return 'destructive';
  }
}

/* ── Building results ────────────────────────────────────────────────────── */

export interface RawDimensionScore {
  id: DimensionId;
  score: Score;
  justification: string;
  quotes?: string[];
  strengths?: string[];
  improvements?: string[];
}

/**
 * Turn raw per-dimension scores into full results, filling any dimension the
 * model omitted with the floor score of 1 (untested) so an omission never
 * inflates the total with a neutral 2.
 */
export function buildDimensionResults(
  raw: readonly RawDimensionScore[],
  fallbackJustification: string,
): DimensionResult[] {
  const byId = new Map<DimensionId, RawDimensionScore>();
  for (const item of raw) {
    if (isDimensionId(item.id)) byId.set(item.id, item);
  }

  return RUBRIC.map((dimension) => {
    const found = byId.get(dimension.id);
    const score = found ? coerceScore(found.score) : (MIN_SCORE as Score);
    return {
      id: dimension.id,
      score,
      weighted: weightedPoints(score, dimension.weight),
      justification: found?.justification?.trim() || fallbackJustification,
      quotes: dedupeStrings(found?.quotes ?? []),
      strengths: dedupeStrings(found?.strengths ?? []),
      improvements: dedupeStrings(found?.improvements ?? []),
    };
  });
}

function dedupeStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Dimensions a given panelist owns — used for per-panelist narratives. */
export function dimensionsOwnedBy(panelist: PanelistId): RubricDimension[] {
  return RUBRIC.filter((dimension) => dimension.owner === panelist);
}

/**
 * Aggregate note-taker annotations per dimension so the grading prompt can be
 * given pre-sorted evidence instead of the whole transcript (PLAN §3).
 */
export interface DimensionEvidence {
  id: DimensionId;
  strengths: string[];
  weaknesses: string[];
  quotes: string[];
}

export function collectEvidence(
  notes: readonly AnswerNote[],
): Record<DimensionId, DimensionEvidence> {
  const out = {} as Record<DimensionId, DimensionEvidence>;
  for (const dimension of RUBRIC) {
    out[dimension.id] = {
      id: dimension.id,
      strengths: [],
      weaknesses: [],
      quotes: [],
    };
  }

  for (const note of notes) {
    const dimensions = Array.isArray(note.dimensions) ? note.dimensions : [];
    for (const dimensionId of dimensions) {
      if (!isDimensionId(dimensionId)) continue;
      const bucket = out[dimensionId];
      bucket.strengths.push(...(note.strengths ?? []));
      bucket.weaknesses.push(...(note.weaknesses ?? []));
      bucket.quotes.push(...(note.quotes ?? []));
    }
  }

  for (const dimension of RUBRIC) {
    const bucket = out[dimension.id];
    bucket.strengths = dedupeStrings(bucket.strengths).slice(0, 12);
    bucket.weaknesses = dedupeStrings(bucket.weaknesses).slice(0, 12);
    bucket.quotes = dedupeStrings(bucket.quotes).slice(0, 12);
  }

  return out;
}

/**
 * Dimensions that should actually be scored for this applicant. Everything is
 * always scored, but `communication` is judged on English fluency only for
 * overseas applicants (PLAN §5) — the caller passes this into the prompt.
 */
export function scoringNotesFor(overseas: boolean): string {
  return overseas
    ? 'The applicant is going overseas: the "communication" dimension must judge English fluency demonstrated during the English segments as well as overall clarity.'
    : 'The applicant is studying domestically: the "communication" dimension judges clarity, structure, and coherence in Bahasa Indonesia only — do not penalise the absence of English.';
}
