/**
 * lib/panel/phases.ts — the six-phase interview state machine (PLAN §3).
 *
 * Budgets: 5 / 10 / 15 / 10 / 12 / 8 minutes = 60 minutes total. Phases advance
 * on elapsed time, but only at a turn boundary and only after the phase has had
 * a minimum number of exchanges, so a fast talker cannot skip a whole phase and
 * a slow one cannot stall the interview forever.
 *
 * Pure module — no LLM calls, no browser APIs. Unit-tested.
 */

import type { PanelistId, PhaseId } from '../types';

export interface PhaseDefinition {
  id: PhaseId;
  /** Time budget in minutes (PLAN §3). */
  minutes: number;
  /** Panelist who leads this phase; the moderator may still bring in others. */
  lead: PanelistId;
  /** Panelists allowed to speak during the phase. */
  participants: readonly PanelistId[];
  /**
   * Minimum panelist questions before a time-based advance is allowed. Prevents
   * a phase being skipped entirely when the candidate answers very slowly.
   */
  minQuestions: number;
  /** Question count after which the phase may advance early. */
  maxQuestions: number;
}

export const PHASES: readonly PhaseDefinition[] = [
  {
    id: 'opening',
    minutes: 5,
    lead: 'lpdp',
    participants: ['lpdp', 'akademisi', 'psikolog'],
    minQuestions: 1,
    maxQuestions: 3,
  },
  {
    id: 'motivation',
    minutes: 10,
    lead: 'psikolog',
    participants: ['psikolog', 'akademisi', 'lpdp'],
    minQuestions: 2,
    maxQuestions: 5,
  },
  {
    id: 'studyPlan',
    minutes: 15,
    lead: 'akademisi',
    participants: ['akademisi', 'psikolog'],
    minQuestions: 3,
    maxQuestions: 8,
  },
  {
    id: 'personality',
    minutes: 10,
    lead: 'psikolog',
    participants: ['psikolog', 'lpdp'],
    minQuestions: 2,
    maxQuestions: 6,
  },
  {
    id: 'contribution',
    minutes: 12,
    lead: 'lpdp',
    participants: ['lpdp', 'psikolog', 'akademisi'],
    minQuestions: 3,
    maxQuestions: 7,
  },
  {
    id: 'closing',
    minutes: 8,
    lead: 'lpdp',
    participants: ['lpdp', 'akademisi', 'psikolog'],
    minQuestions: 1,
    maxQuestions: 4,
  },
] as const;

export const PHASE_IDS: readonly PhaseId[] = PHASES.map((phase) => phase.id);

/** Total interview budget in ms — 60 minutes (PLAN §1). */
export const TOTAL_BUDGET_MS =
  PHASES.reduce((sum, phase) => sum + phase.minutes, 0) * 60_000;

/** Hard stop: the panel wraps up once this much time has passed. */
export const HARD_STOP_MS = TOTAL_BUDGET_MS;

/** Elapsed time at which the panel starts steering toward a close. */
export const WRAP_UP_THRESHOLD_MS = TOTAL_BUDGET_MS - 5 * 60_000;

export function getPhase(id: PhaseId): PhaseDefinition {
  const found = PHASES.find((phase) => phase.id === id);
  if (!found) throw new Error(`Unknown phase: ${id}`);
  return found;
}

export function phaseIndex(id: PhaseId): number {
  return PHASES.findIndex((phase) => phase.id === id);
}

export function isPhaseId(value: unknown): value is PhaseId {
  return typeof value === 'string' && PHASE_IDS.includes(value as PhaseId);
}

export function phaseBudgetMs(id: PhaseId): number {
  return getPhase(id).minutes * 60_000;
}

/** Elapsed ms at which a phase is scheduled to begin. */
export function phaseStartOffsetMs(id: PhaseId): number {
  const index = phaseIndex(id);
  return PHASES.slice(0, Math.max(0, index)).reduce(
    (sum, phase) => sum + phase.minutes * 60_000,
    0,
  );
}

/** Elapsed ms by which a phase should be finished. */
export function phaseDeadlineMs(id: PhaseId): number {
  return phaseStartOffsetMs(id) + phaseBudgetMs(id);
}

export function nextPhase(id: PhaseId): PhaseId | null {
  const index = phaseIndex(id);
  if (index < 0 || index >= PHASES.length - 1) return null;
  return PHASES[index + 1]!.id;
}

export function isLastPhase(id: PhaseId): boolean {
  return phaseIndex(id) === PHASES.length - 1;
}

/* ── Advance decision ────────────────────────────────────────────────────── */

export interface PhaseState {
  phase: PhaseId;
  /** Total elapsed interview time in ms. */
  elapsedMs: number;
  /** Elapsed ms when the current phase started. */
  phaseStartedMs: number;
  /** Panelist questions asked so far in the current phase. */
  questionsInPhase: number;
}

export type PhaseAction =
  | { type: 'stay'; reason: string }
  | { type: 'advance'; to: PhaseId; reason: string }
  | { type: 'finish'; reason: string };

/**
 * Decide whether to stay in the current phase, advance, or finish. Called at
 * turn boundaries, never mid-stream.
 */
export function decidePhase(state: PhaseState): PhaseAction {
  const definition = getPhase(state.phase);
  const timeInPhase = Math.max(0, state.elapsedMs - state.phaseStartedMs);
  const budget = phaseBudgetMs(state.phase);
  const last = isLastPhase(state.phase);

  // Absolute time limit: wrap up regardless of where we are.
  if (state.elapsedMs >= HARD_STOP_MS) {
    return { type: 'finish', reason: 'total time budget exhausted' };
  }

  if (last) {
    // The closing phase ends on its own budget or question cap.
    if (timeInPhase >= budget && state.questionsInPhase >= definition.minQuestions) {
      return { type: 'finish', reason: 'closing phase budget reached' };
    }
    if (state.questionsInPhase >= definition.maxQuestions) {
      return { type: 'finish', reason: 'closing phase question cap reached' };
    }
    return { type: 'stay', reason: 'closing phase continues' };
  }

  const upcoming = nextPhase(state.phase);
  if (!upcoming) {
    return { type: 'stay', reason: 'no further phase' };
  }

  // Question cap: the phase has covered enough ground, move on early.
  if (state.questionsInPhase >= definition.maxQuestions) {
    return { type: 'advance', to: upcoming, reason: 'question cap reached' };
  }

  // Time: over budget, but only once the phase asked its minimum questions.
  if (timeInPhase >= budget && state.questionsInPhase >= definition.minQuestions) {
    return { type: 'advance', to: upcoming, reason: 'phase budget reached' };
  }

  // Behind schedule overall: the wall-clock has already passed this phase's
  // scheduled deadline, so catch up as soon as the minimum is satisfied.
  if (
    state.elapsedMs >= phaseDeadlineMs(state.phase) &&
    state.questionsInPhase >= definition.minQuestions
  ) {
    return { type: 'advance', to: upcoming, reason: 'behind overall schedule' };
  }

  return { type: 'stay', reason: 'phase in progress' };
}

/** Whether the panel should begin steering toward a close. */
export function shouldWrapUp(elapsedMs: number): boolean {
  return elapsedMs >= WRAP_UP_THRESHOLD_MS;
}

export function remainingMs(elapsedMs: number): number {
  return Math.max(0, HARD_STOP_MS - elapsedMs);
}

/** 0–100 progress through the whole interview. */
export function progressPercent(elapsedMs: number): number {
  return Math.min(100, (elapsedMs / HARD_STOP_MS) * 100);
}

/**
 * Whether the Akademisi should use English for this turn (PLAN §1: overseas
 * applicants get sudden English segments).
 *
 * Deterministic so it is testable: the English segment happens during the
 * study-plan deep dive, from the second question onward, on alternating turns.
 */
export function shouldSpeakEnglish(options: {
  panelist: PanelistId;
  phase: PhaseId;
  questionsInPhase: number;
  englishSegments: boolean;
}): boolean {
  if (!options.englishSegments) return false;
  if (options.panelist !== 'akademisi') return false;
  if (options.phase !== 'studyPlan') return false;
  // Start the English segment on the 2nd question of the deep dive, then
  // alternate so the candidate experiences switching in both directions.
  return options.questionsInPhase >= 1 && options.questionsInPhase % 2 === 1;
}
