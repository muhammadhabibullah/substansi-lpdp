import { describe, expect, it } from 'vitest';

import {
  decidePhase,
  HARD_STOP_MS,
  isLastPhase,
  nextPhase,
  PHASES,
  phaseBudgetMs,
  phaseDeadlineMs,
  phaseIndex,
  phaseStartOffsetMs,
  progressPercent,
  remainingMs,
  shouldSpeakEnglish,
  shouldWrapUp,
  TOTAL_BUDGET_MS,
  type PhaseState,
} from './phases';

const MINUTE = 60_000;

describe('phase table matches PLAN §3', () => {
  it('has the six phases in order', () => {
    expect(PHASES.map((phase) => phase.id)).toEqual([
      'opening',
      'motivation',
      'studyPlan',
      'personality',
      'contribution',
      'closing',
    ]);
  });

  it('uses the documented 5/10/15/10/12/8 minute budgets', () => {
    expect(PHASES.map((phase) => phase.minutes)).toEqual([5, 10, 15, 10, 12, 8]);
  });

  it('totals a 60-minute interview', () => {
    expect(TOTAL_BUDGET_MS).toBe(60 * MINUTE);
    expect(HARD_STOP_MS).toBe(60 * MINUTE);
  });

  it('leads each phase with the panelist PLAN assigns', () => {
    expect(PHASES.find((p) => p.id === 'studyPlan')?.lead).toBe('akademisi');
    expect(PHASES.find((p) => p.id === 'personality')?.lead).toBe('psikolog');
    expect(PHASES.find((p) => p.id === 'contribution')?.lead).toBe('lpdp');
  });

  it('only lets participants of a phase speak in it', () => {
    for (const phase of PHASES) {
      expect(phase.participants).toContain(phase.lead);
      expect(phase.minQuestions).toBeLessThanOrEqual(phase.maxQuestions);
    }
  });
});

describe('offsets and deadlines', () => {
  it('starts the first phase at zero', () => {
    expect(phaseStartOffsetMs('opening')).toBe(0);
  });

  it('accumulates prior budgets', () => {
    expect(phaseStartOffsetMs('motivation')).toBe(5 * MINUTE);
    expect(phaseStartOffsetMs('studyPlan')).toBe(15 * MINUTE);
    expect(phaseStartOffsetMs('closing')).toBe(52 * MINUTE);
  });

  it('ends the last phase exactly at the hard stop', () => {
    expect(phaseDeadlineMs('closing')).toBe(HARD_STOP_MS);
  });

  it('reports phase order helpers', () => {
    expect(phaseIndex('opening')).toBe(0);
    expect(isLastPhase('closing')).toBe(true);
    expect(isLastPhase('opening')).toBe(false);
    expect(nextPhase('opening')).toBe('motivation');
    expect(nextPhase('closing')).toBeNull();
  });
});

describe('decidePhase', () => {
  const base: PhaseState = {
    phase: 'opening',
    elapsedMs: 0,
    phaseStartedMs: 0,
    questionsInPhase: 0,
  };

  it('stays while the phase is fresh', () => {
    expect(decidePhase(base).type).toBe('stay');
  });

  it('does not advance on time before the minimum questions are asked', () => {
    // Well past the 5-minute opening budget, but nothing has been asked.
    const action = decidePhase({ ...base, elapsedMs: 6 * MINUTE, questionsInPhase: 0 });
    expect(action.type).toBe('stay');
  });

  it('advances once the budget is spent and the minimum is met', () => {
    const action = decidePhase({ ...base, elapsedMs: 6 * MINUTE, questionsInPhase: 1 });
    expect(action).toMatchObject({ type: 'advance', to: 'motivation' });
  });

  it('advances early when the question cap is reached', () => {
    const action = decidePhase({ ...base, elapsedMs: MINUTE, questionsInPhase: 3 });
    expect(action).toMatchObject({ type: 'advance', to: 'motivation' });
  });

  it('catches up when the interview is behind the overall schedule', () => {
    // Still inside this phase's own budget, but the wall clock has moved past
    // the point where the opening phase should have finished.
    const action = decidePhase({
      phase: 'opening',
      elapsedMs: 7 * MINUTE,
      phaseStartedMs: 6 * MINUTE,
      questionsInPhase: 1,
    });
    expect(action).toMatchObject({ type: 'advance', to: 'motivation' });
  });

  it('finishes when the total budget is exhausted', () => {
    const action = decidePhase({
      phase: 'studyPlan',
      elapsedMs: HARD_STOP_MS,
      phaseStartedMs: 15 * MINUTE,
      questionsInPhase: 4,
    });
    expect(action.type).toBe('finish');
  });

  it('finishes from the closing phase on its own budget', () => {
    const action = decidePhase({
      phase: 'closing',
      elapsedMs: 58 * MINUTE,
      phaseStartedMs: 50 * MINUTE,
      questionsInPhase: 2,
    });
    expect(action.type).toBe('finish');
  });

  it('finishes the closing phase at its question cap', () => {
    const action = decidePhase({
      phase: 'closing',
      elapsedMs: 53 * MINUTE,
      phaseStartedMs: 52 * MINUTE,
      questionsInPhase: 4,
    });
    expect(action.type).toBe('finish');
  });

  it('never advances past the last phase', () => {
    const action = decidePhase({
      phase: 'closing',
      elapsedMs: 53 * MINUTE,
      phaseStartedMs: 52 * MINUTE,
      questionsInPhase: 0,
    });
    expect(action.type).toBe('stay');
  });

  it('walks the whole interview from start to finish', () => {
    // Simulate a candidate answering steadily: the machine must reach 'finish'
    // and pass through every phase exactly once.
    let state: PhaseState = { ...base };
    const visited: string[] = [state.phase];
    let guard = 0;

    while (guard < 200) {
      guard += 1;
      state = {
        ...state,
        elapsedMs: state.elapsedMs + 2 * MINUTE,
        questionsInPhase: state.questionsInPhase + 1,
      };
      const action = decidePhase(state);
      if (action.type === 'finish') break;
      if (action.type === 'advance') {
        state = { ...state, phase: action.to, phaseStartedMs: state.elapsedMs, questionsInPhase: 0 };
        visited.push(action.to);
      }
    }

    expect(guard).toBeLessThan(200);
    expect(visited).toEqual([
      'opening',
      'motivation',
      'studyPlan',
      'personality',
      'contribution',
      'closing',
    ]);
  });
});

describe('clock helpers', () => {
  it('signals wrap-up in the final five minutes', () => {
    expect(shouldWrapUp(54 * MINUTE)).toBe(false);
    expect(shouldWrapUp(55 * MINUTE)).toBe(true);
    expect(shouldWrapUp(59 * MINUTE)).toBe(true);
  });

  it('never reports negative time remaining', () => {
    expect(remainingMs(10 * MINUTE)).toBe(50 * MINUTE);
    expect(remainingMs(HARD_STOP_MS + 5 * MINUTE)).toBe(0);
  });

  it('caps progress at 100%', () => {
    expect(progressPercent(0)).toBe(0);
    expect(progressPercent(30 * MINUTE)).toBe(50);
    expect(progressPercent(HARD_STOP_MS * 2)).toBe(100);
  });
});

describe('shouldSpeakEnglish (PLAN §1 English segments)', () => {
  const base = {
    panelist: 'akademisi' as const,
    phase: 'studyPlan' as const,
    questionsInPhase: 1,
    englishSegments: true,
  };

  it('stays in Indonesian for domestic applicants', () => {
    expect(shouldSpeakEnglish({ ...base, englishSegments: false })).toBe(false);
  });

  it('only the Akademisi switches languages', () => {
    expect(shouldSpeakEnglish({ ...base, panelist: 'psikolog' })).toBe(false);
    expect(shouldSpeakEnglish({ ...base, panelist: 'lpdp' })).toBe(false);
  });

  it('only switches during the study-plan deep dive', () => {
    expect(shouldSpeakEnglish({ ...base, phase: 'motivation' })).toBe(false);
    expect(shouldSpeakEnglish({ ...base, phase: 'contribution' })).toBe(false);
  });

  it('starts on the second question and then alternates', () => {
    expect(shouldSpeakEnglish({ ...base, questionsInPhase: 0 })).toBe(false);
    expect(shouldSpeakEnglish({ ...base, questionsInPhase: 1 })).toBe(true);
    expect(shouldSpeakEnglish({ ...base, questionsInPhase: 2 })).toBe(false);
    expect(shouldSpeakEnglish({ ...base, questionsInPhase: 3 })).toBe(true);
  });
});
