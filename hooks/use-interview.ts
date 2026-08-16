'use client';

import * as React from 'react';

import { LlmError, streamComplete, toLlmError } from '@/lib/llm';
import { buildPanelistMessages } from '@/lib/panel/personas';
import { decideNextSpeaker } from '@/lib/panel/moderator';
import { annotateAnswer } from '@/lib/panel/notetaker';
import {
  addTurn,
  applyPhaseAction,
  buildModeratorContext,
  buildPanelistContext,
  createSession,
  evaluatePhase,
  followCandidateLanguage,
  lastPanelistQuestion,
  planPanelistTurn,
  questionsInPhase,
  resumeSession,
  tickClock,
} from '@/lib/panel/engine';
import { HARD_STOP_MS, remainingMs, TOTAL_BUDGET_MS } from '@/lib/panel/phases';
import {
  clearSession,
  loadSession,
  saveDocuments,
  saveSession,
  StorageFullError,
} from '@/lib/storage';
import { oversizedKinds, summarizeOversized } from '@/lib/summarize';
import type {
  DocumentSet,
  InterviewSession,
  LlmSettings,
  PanelistId,
  Profile,
} from '@/lib/types';

/** A panelist turn currently streaming in. */
export interface StreamingTurn {
  panelist: PanelistId;
  text: string;
}

export type InterviewError =
  | { kind: 'llm'; error: LlmError }
  | { kind: 'storage' }
  | { kind: 'note-taker' };

export interface UseInterviewOptions {
  settings: LlmSettings;
  documents: DocumentSet;
  profile: Profile;
  /** Locale used for report generation defaults. */
  ready: boolean;
}

export interface UseInterviewResult {
  session: InterviewSession | null;
  /** True while the panel is producing a turn. */
  busy: boolean;
  /** True while oversized documents are being summarised (M2-4). */
  preparingDocs: boolean;
  streaming: StreamingTurn | null;
  error: InterviewError | null;
  /** Soft warning that does not block the interview. */
  warning: InterviewError | null;
  elapsedMs: number;
  remainingMs: number;
  recovered: boolean;
  start: () => void;
  submitAnswer: (text: string) => void;
  retry: () => void;
  skipTurn: () => void;
  endEarly: () => void;
  dismissWarning: () => void;
  reset: () => void;
}

/** How often the visible clock updates. */
const TICK_INTERVAL_MS = 1000;

/**
 * Drives one interview session: the moderator → panelist → note-taker loop, the
 * 60-minute clock, crash recovery, and error recovery.
 *
 * All model orchestration is funnelled through `runPanelTurn`, which is
 * abort-safe: unmounting or ending early cancels the in-flight request.
 */
export function useInterview(options: UseInterviewOptions): UseInterviewResult {
  const { settings, documents, profile } = options;

  const [session, setSession] = React.useState<InterviewSession | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [streaming, setStreaming] = React.useState<StreamingTurn | null>(null);
  const [error, setError] = React.useState<InterviewError | null>(null);
  const [warning, setWarning] = React.useState<InterviewError | null>(null);
  const [recovered, setRecovered] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  /** True while oversized documents are being condensed before the first turn. */
  const [preparingDocs, setPreparingDocs] = React.useState(false);

  // Refs mirror state for use inside async loops without stale closures.
  const sessionRef = React.useRef<InterviewSession | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const busyRef = React.useRef(false);
  const settingsRef = React.useRef(settings);
  const documentsRef = React.useRef(documents);

  settingsRef.current = settings;
  documentsRef.current = documents;

  const commit = React.useCallback((next: InterviewSession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) {
      try {
        saveSession(next);
      } catch (storageError) {
        if (storageError instanceof StorageFullError) {
          setWarning({ kind: 'storage' });
        }
      }
    }
  }, []);

  /* ── Crash recovery (M3-6) ─────────────────────────────────────────────── */

  React.useEffect(() => {
    const stored = loadSession();
    if (stored && (stored.status === 'running' || stored.status === 'wrapping')) {
      const resumed = resumeSession(stored);
      sessionRef.current = resumed;
      setSession(resumed);
      setRecovered(true);
    } else if (stored) {
      sessionRef.current = stored;
      setSession(stored);
    }
    setHydrated(true);
  }, []);

  /* ── Visible clock ─────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!session || (session.status !== 'running' && session.status !== 'wrapping')) {
      return;
    }
    const timer = window.setInterval(() => {
      const current = sessionRef.current;
      if (!current) return;
      const ticked = tickClock(current);
      sessionRef.current = ticked;
      setSession(ticked);
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [session?.status, session?.id]);

  // Persist the ticking clock periodically rather than every second.
  React.useEffect(() => {
    if (!session || (session.status !== 'running' && session.status !== 'wrapping')) {
      return;
    }
    const timer = window.setInterval(() => {
      const current = sessionRef.current;
      if (current) {
        try {
          saveSession(current);
        } catch {
          /* quota handled on commit */
        }
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [session?.status, session?.id]);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  /* ── Core loop ─────────────────────────────────────────────────────────── */

  /**
   * Run one panel turn: advance the phase machine, ask the moderator who speaks,
   * stream that panelist's question, and persist the result.
   */
  const runPanelTurn = React.useCallback(
    async (options2: { endingEarly?: boolean } = {}) => {
      const current = sessionRef.current;
      if (!current) return;
      if (busyRef.current) return;

      busyRef.current = true;
      setBusy(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // 1. Clock + phase bookkeeping.
        let working = tickClock(current);
        const action = evaluatePhase(working);
        working = applyPhaseAction(working, action);

        const finishing =
          options2.endingEarly === true ||
          action.type === 'finish' ||
          working.elapsedMs >= HARD_STOP_MS;

        if (finishing && working.status !== 'wrapping') {
          working = { ...working, status: 'wrapping' };
        }

        // A wrapping session gets exactly one closing turn, then ends.
        const alreadyClosed =
          working.status === 'wrapping' &&
          working.turns.some(
            (turn) => turn.phase === 'closing' && turn.speaker !== 'user',
          ) &&
          questionsInPhase(working, 'closing') > 0 &&
          options2.endingEarly !== true;

        if (alreadyClosed) {
          commit({ ...working, status: 'finished', finishedAt: Date.now() });
          return;
        }

        commit(working);

        // 2. Moderator picks the next speaker and directive.
        const decision = await decideNextSpeaker(
          buildModeratorContext(working, documentsRef.current),
          settingsRef.current,
          controller.signal,
        );

        // 3. Stream the panelist's turn.
        const plan = planPanelistTurn(working, decision, {
          endingEarly: options2.endingEarly || finishing,
        });
        const messages = buildPanelistMessages(
          buildPanelistContext(working, documentsRef.current, plan),
        );

        setStreaming({ panelist: plan.panelist, text: '' });

        const text = await streamComplete({
          settings: settingsRef.current,
          messages,
          tier: 'main',
          maxTokens: 700,
          signal: controller.signal,
          onDelta: (delta) => {
            setStreaming((live) =>
              live ? { ...live, text: live.text + delta } : live,
            );
          },
        });

        setStreaming(null);

        // 4. Record the turn.
        const latest = tickClock(sessionRef.current ?? working);
        const { session: withTurn } = addTurn(latest, {
          speaker: plan.panelist,
          text,
          phase: latest.phase,
          lang: plan.lang,
        });

        const closed = plan.requestClosingStatement && options2.endingEarly === true;
        commit(
          closed
            ? withTurn
            : {
                ...withTurn,
                status: finishing ? 'wrapping' : withTurn.status,
              },
        );
      } catch (caught) {
        setStreaming(null);
        const llmError = toLlmError(caught);
        // An intentional abort (end early / unmount) is not an error to show.
        if (llmError.kind !== 'aborted') {
          setError({ kind: 'llm', error: llmError });
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        abortRef.current = null;
      }
    },
    [commit],
  );

  /* ── Public actions ────────────────────────────────────────────────────── */

  const start = React.useCallback(() => {
    const fresh = createSession({
      profile,
      model: settingsRef.current.model,
      locale: 'id',
    });
    setRecovered(false);
    setError(null);
    setWarning(null);
    commit(fresh);

    // Condense oversized documents once, before the first turn (M2-4). The
    // summarised set is persisted so later turns and reloads reuse it rather
    // than re-summarising. On failure the originals stay and excerpt building
    // falls back to smart truncation.
    const pending = documentsRef.current;
    if (oversizedKinds(pending).length > 0) {
      setPreparingDocs(true);
      void summarizeOversized(pending, settingsRef.current)
        .then((condensed) => {
          documentsRef.current = condensed;
          try {
            saveDocuments(condensed);
          } catch {
            /* quota: keep the in-memory version */
          }
        })
        .finally(() => {
          setPreparingDocs(false);
          void runPanelTurn();
        });
      return;
    }

    void runPanelTurn();
  }, [commit, profile, runPanelTurn]);

  /**
   * Record the candidate's answer, then annotate it in the background while the
   * next panel turn is already being produced.
   */
  const submitAnswer = React.useCallback(
    (text: string) => {
      const current = sessionRef.current;
      if (!current || busyRef.current) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const ticked = tickClock(current);
      const question = lastPanelistQuestion(ticked);
      const { session: withAnswer, turn } = addTurn(ticked, {
        speaker: 'user',
        text: trimmed,
        phase: ticked.phase,
        lang: ticked.lang,
      });

      // The panel follows the candidate's language (PLAN §1).
      const withLanguage = followCandidateLanguage(withAnswer, trimmed);
      commit(withLanguage);

      // Note-taker runs silently and never blocks the interview (M4-1).
      void annotateAnswer(
        { answer: turn, question, profile: withLanguage.profile },
        settingsRef.current,
      ).then((note) => {
        if (!note) {
          setWarning({ kind: 'note-taker' });
          return;
        }
        const live = sessionRef.current;
        if (!live) return;
        commit({ ...live, notes: [...live.notes, note] });
      });

      void runPanelTurn();
    },
    [commit, runPanelTurn],
  );

  const retry = React.useCallback(() => {
    setError(null);
    void runPanelTurn();
  }, [runPanelTurn]);

  /** Skip a failed panel turn by nudging the phase machine forward. */
  const skipTurn = React.useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    setError(null);
    const ticked = tickClock(current);
    const action = evaluatePhase(ticked);
    commit(applyPhaseAction(ticked, action));
    void runPanelTurn();
  }, [commit, runPanelTurn]);

  const endEarly = React.useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    // Cancel any in-flight turn so the closing turn is the last thing said.
    abortRef.current?.abort();
    busyRef.current = false;
    setBusy(false);
    setStreaming(null);

    const ticked = tickClock(current);
    commit({
      ...ticked,
      status: 'finished',
      finishedAt: Date.now(),
    });
  }, [commit]);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    clearSession();
    sessionRef.current = null;
    setSession(null);
    setRecovered(false);
    setError(null);
    setWarning(null);
  }, []);

  const dismissWarning = React.useCallback(() => setWarning(null), []);

  const elapsed = session?.elapsedMs ?? 0;

  return {
    session: hydrated ? session : null,
    busy,
    preparingDocs,
    streaming,
    error,
    warning,
    elapsedMs: elapsed,
    remainingMs: remainingMs(elapsed),
    recovered,
    start,
    submitAnswer,
    retry,
    skipTurn,
    endEarly,
    dismissWarning,
    reset,
  };
}

export { TOTAL_BUDGET_MS };
