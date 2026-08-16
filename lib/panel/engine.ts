/**
 * lib/panel/engine.ts — pure interview-engine helpers shared by the UI hook.
 *
 * Everything here is deterministic and testable: session construction, phase
 * bookkeeping, clock arithmetic, and building the context objects the moderator
 * and panelists consume. The React hook (`hooks/use-interview.ts`) owns the
 * side effects.
 */

import type {
  DocumentSet,
  InterviewSession,
  PanelistId,
  PhaseId,
  Profile,
  TranscriptTurn,
} from '../types';
import type { Locale } from '../i18n';
import { createId } from '../utils';
import {
  decidePhase,
  getPhase,
  HARD_STOP_MS,
  remainingMs,
  shouldSpeakEnglish,
  shouldWrapUp,
  type PhaseAction,
} from './phases';
import type { ModeratorContext, ModeratorDecision } from './moderator';
import type { PanelistPromptContext } from './personas';

/* ── Session lifecycle ───────────────────────────────────────────────────── */

export function createSession(options: {
  profile: Profile;
  model: string;
  locale: Locale;
}): InterviewSession {
  const now = Date.now();
  return {
    id: createId('session'),
    startedAt: now,
    elapsedMs: 0,
    tickedAt: now,
    status: 'running',
    phase: 'opening',
    phaseStartedMs: 0,
    turns: [],
    notes: [],
    lastSpeaker: null,
    lang: 'id',
    profile: options.profile,
    model: options.model,
  };
}

/**
 * Advance the stored clock to now. Called before any decision that depends on
 * elapsed time, and on every UI tick, so a reload never loses or double-counts.
 */
export function tickClock(
  session: InterviewSession,
  now = Date.now(),
): InterviewSession {
  if (session.status !== 'running' && session.status !== 'wrapping') {
    return { ...session, tickedAt: now };
  }
  const delta = Math.max(0, now - session.tickedAt);
  return {
    ...session,
    elapsedMs: Math.min(HARD_STOP_MS + 60_000, session.elapsedMs + delta),
    tickedAt: now,
  };
}

/**
 * Resume a session loaded from storage. Time spent with the tab closed does not
 * count against the interview — otherwise a reload an hour later would find the
 * session already over.
 */
export function resumeSession(session: InterviewSession): InterviewSession {
  return { ...session, tickedAt: Date.now() };
}

export function addTurn(
  session: InterviewSession,
  turn: Omit<TranscriptTurn, 'id' | 'atMs'> & { atMs?: number },
): { session: InterviewSession; turn: TranscriptTurn } {
  const created: TranscriptTurn = {
    id: createId('turn'),
    atMs: turn.atMs ?? session.elapsedMs,
    speaker: turn.speaker,
    text: turn.text,
    phase: turn.phase,
    lang: turn.lang,
  };
  return {
    session: {
      ...session,
      turns: [...session.turns, created],
      lastSpeaker: isPanelist(created.speaker) ? created.speaker : session.lastSpeaker,
    },
    turn: created,
  };
}

function isPanelist(speaker: TranscriptTurn['speaker']): speaker is PanelistId {
  return speaker === 'akademisi' || speaker === 'psikolog' || speaker === 'lpdp';
}

/* ── Phase bookkeeping ───────────────────────────────────────────────────── */

/** Panelist questions asked so far in the given phase. */
export function questionsInPhase(
  session: InterviewSession,
  phase: PhaseId = session.phase,
): number {
  return session.turns.filter((turn) => turn.phase === phase && isPanelist(turn.speaker))
    .length;
}

/** Evaluate the phase machine against the session's current state. */
export function evaluatePhase(session: InterviewSession): PhaseAction {
  return decidePhase({
    phase: session.phase,
    elapsedMs: session.elapsedMs,
    phaseStartedMs: session.phaseStartedMs,
    questionsInPhase: questionsInPhase(session),
  });
}

/** Apply an advance decision, resetting the per-phase clock. */
export function applyPhaseAction(
  session: InterviewSession,
  action: PhaseAction,
): InterviewSession {
  if (action.type === 'advance') {
    return {
      ...session,
      phase: action.to,
      phaseStartedMs: session.elapsedMs,
    };
  }
  if (action.type === 'finish') {
    return { ...session, status: 'wrapping' };
  }
  return session;
}

/* ── Context builders ────────────────────────────────────────────────────── */

export function buildModeratorContext(
  session: InterviewSession,
  documents: DocumentSet,
): ModeratorContext {
  return {
    phase: session.phase,
    elapsedMs: session.elapsedMs,
    remainingMs: remainingMs(session.elapsedMs),
    questionsInPhase: questionsInPhase(session),
    lastSpeaker: session.lastSpeaker,
    history: session.turns,
    profile: session.profile,
    documents,
  };
}

export interface PanelistTurnPlan {
  panelist: PanelistId;
  directive: string;
  useEnglish: boolean;
  lang: Locale;
  wrapUp: boolean;
  requestClosingStatement: boolean;
}

/**
 * Decide how the chosen panelist should speak this turn: language, wrap-up
 * pressure, and whether this is the closing-statement prompt.
 */
export function planPanelistTurn(
  session: InterviewSession,
  decision: ModeratorDecision,
  options: { endingEarly?: boolean } = {},
): PanelistTurnPlan {
  const asked = questionsInPhase(session);
  const wrapUp = options.endingEarly || shouldWrapUp(session.elapsedMs);

  const useEnglish = shouldSpeakEnglish({
    panelist: decision.panelist,
    phase: session.phase,
    questionsInPhase: asked,
    englishSegments: session.profile.englishSegments,
  });

  const closingPhase = getPhase(session.phase).id === 'closing';
  const requestClosingStatement =
    options.endingEarly === true ||
    session.status === 'wrapping' ||
    (closingPhase && asked >= getPhase('closing').maxQuestions - 1);

  return {
    panelist: decision.panelist,
    directive: decision.directive,
    useEnglish,
    // English segments are spoken in English; otherwise follow the candidate.
    lang: useEnglish ? 'en' : session.lang,
    wrapUp,
    requestClosingStatement,
  };
}

export function buildPanelistContext(
  session: InterviewSession,
  documents: DocumentSet,
  plan: PanelistTurnPlan,
): PanelistPromptContext {
  return {
    panelist: plan.panelist,
    profile: session.profile,
    documents,
    phase: session.phase,
    history: session.turns,
    directive: plan.directive,
    useEnglish: plan.useEnglish,
    wrapUp: plan.wrapUp,
    requestClosingStatement: plan.requestClosingStatement,
    remainingMinutes: remainingMs(session.elapsedMs) / 60_000,
  };
}

/* ── Language following (M3-5) ───────────────────────────────────────────── */

/**
 * Detect whether the candidate answered in English so the panel can follow
 * (PLAN §1). Heuristic and cheap: common-word ratio plus Indonesian markers.
 * Only long-enough answers can flip the session language, to avoid a stray
 * English phrase switching the whole interview.
 */
export function detectLanguage(text: string): Locale | null {
  const clean = text.toLowerCase().replace(/[^a-z\s']/g, ' ');
  const words = clean.split(/\s+/).filter((word) => word.length > 1);
  if (words.length < 12) return null;

  const englishMarkers = new Set([
    'the', 'and', 'is', 'are', 'was', 'were', 'my', 'i', 'to', 'of', 'in', 'that',
    'this', 'for', 'with', 'have', 'has', 'will', 'would', 'because', 'about',
    'research', 'want', 'study', 'should', 'they', 'their', 'been', 'from',
  ]);
  const indonesianMarkers = new Set([
    'yang', 'dan', 'saya', 'untuk', 'dengan', 'ini', 'itu', 'akan', 'dari',
    'tidak', 'adalah', 'karena', 'pada', 'juga', 'bisa', 'sudah', 'kami',
    'kemudian', 'sehingga', 'tersebut', 'dalam', 'oleh',
  ]);

  let english = 0;
  let indonesian = 0;
  for (const word of words) {
    if (englishMarkers.has(word)) english += 1;
    if (indonesianMarkers.has(word)) indonesian += 1;
  }

  // Require a clear margin so mixed answers do not thrash the language.
  if (english >= 4 && english > indonesian * 2) return 'en';
  if (indonesian >= 4 && indonesian > english * 2) return 'id';
  return null;
}

/** Update the session language from the candidate's latest answer. */
export function followCandidateLanguage(
  session: InterviewSession,
  answer: string,
): InterviewSession {
  const detected = detectLanguage(answer);
  if (!detected || detected === session.lang) return session;
  return { ...session, lang: detected };
}

/** The most recent panelist question, used as note-taker context. */
export function lastPanelistQuestion(session: InterviewSession): string {
  for (let index = session.turns.length - 1; index >= 0; index -= 1) {
    const turn = session.turns[index]!;
    if (isPanelist(turn.speaker)) return turn.text;
  }
  return '';
}
