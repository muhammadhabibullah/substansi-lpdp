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
  it('has the six phases in strict role order', () => {
    // Akademisi (opening + study plan) → Psikolog (motivation + personality)
    // → Tim LPDP (contribution + closing).
    expect(PHASES.map((phase) => phase.id)).toEqual([
      'opening',
      'studyPlan',
      'motivation',
      'personality',
      'contribution',
      'closing',
    ]);
  });

  it('uses the documented 5/15/10/10/15/5 minute budgets', () => {
    expect(PHASES.map((phase) => phase.minutes)).toEqual([5, 15, 10, 10, 15, 5]);
  });

  it('totals a 60-minute interview', () => {
    expect(TOTAL_BUDGET_MS).toBe(60 * MINUTE);
    expect(HARD_STOP_MS).toBe(60 * MINUTE);
  });

  it('leads each phase with the panelist PLAN assigns', () => {
    expect(PHASES.find((p) => p.id === 'opening')?.lead).toBe('akademisi');
    expect(PHASES.find((p) => p.id === 'studyPlan')?.lead).toBe('akademisi');
    expect(PHASES.find((p) => p.id === 'motivation')?.lead).toBe('psikolog');
    expect(PHASES.find((p) => p.id === 'personality')?.lead).toBe('psikolog');
    expect(PHASES.find((p) => p.id === 'contribution')?.lead).toBe('lpdp');
    expect(PHASES.find((p) => p.id === 'closing')?.lead).toBe('lpdp');
  });

  it('only lets participants of a phase speak in it', () => {
    for (const phase of PHASES) {
      expect(phase.participants).toContain(phase.lead);
      expect(phase.minQuestions).toBeLessThanOrEqual(phase.maxQuestions);
    }
  });

  it('lets every panelist speak in every phase (follow-up interjections)', () => {
    for (const phase of PHASES) {
      expect([...phase.participants].sort()).toEqual(
        ['akademisi', 'lpdp', 'psikolog'].sort(),
      );
    }
  });

  it('gives each role a ~20 minute lead block', () => {
    const leadMinutes: Record<string, number> = { akademisi: 0, psikolog: 0, lpdp: 0 };
    for (const phase of PHASES) {
      leadMinutes[phase.lead] = (leadMinutes[phase.lead] ?? 0) + phase.minutes;
    }
    // Akademisi leads opening + study plan (20'), Psikolog motivation +
    // personality (20'), Tim LPDP contribution + closing (20').
    expect(leadMinutes.akademisi).toBe(20);
    expect(leadMinutes.psikolog).toBe(20);
    expect(leadMinutes.lpdp).toBe(20);
  });
});

describe('offsets and deadlines', () => {
  it('starts the first phase at zero', () => {
    expect(phaseStartOffsetMs('opening')).toBe(0);
  });

  it('accumulates prior budgets', () => {
    expect(phaseStartOffsetMs('studyPlan')).toBe(5 * MINUTE);
    expect(phaseStartOffsetMs('motivation')).toBe(20 * MINUTE);
    expect(phaseStartOffsetMs('closing')).toBe(55 * MINUTE);
  });

  it('ends the last phase exactly at the hard stop', () => {
    expect(phaseDeadlineMs('closing')).toBe(HARD_STOP_MS);
  });

  it('reports phase order helpers', () => {
    expect(phaseIndex('opening')).toBe(0);
    expect(isLastPhase('closing')).toBe(true);
    expect(isLastPhase('opening')).toBe(false);
    expect(nextPhase('opening')).toBe('studyPlan');
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
    expect(action).toMatchObject({ type: 'advance', to: 'studyPlan' });
  });

  it('advances early when the question cap is reached', () => {
    const action = decidePhase({ ...base, elapsedMs: MINUTE, questionsInPhase: 3 });
    expect(action).toMatchObject({ type: 'advance', to: 'studyPlan' });
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
    expect(action).toMatchObject({ type: 'advance', to: 'studyPlan' });
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
    // The closing phase started a little early (53'); its 5' in-phase budget
    // is spent (6' elapsed) and the minimum question count is met.
    const action = decidePhase({
      phase: 'closing',
      elapsedMs: 59 * MINUTE,
      phaseStartedMs: 53 * MINUTE,
      questionsInPhase: 2,
    });
    expect(action.type).toBe('finish');
  });

  it('keeps the session order strict: no phase may be skipped or reordered', () => {
    for (let index = 0; index < PHASES.length - 1; index += 1) {
      expect(nextPhase(PHASES[index]!.id)).toBe(PHASES[index + 1]!.id);
    }
  });

  it('finishes the closing phase at its question cap', () => {
    const action = decidePhase({
      phase: 'closing',
      elapsedMs: 56 * MINUTE,
      phaseStartedMs: 55 * MINUTE,
      questionsInPhase: 3,
    });
    expect(action.type).toBe('finish');
  });

  it('never advances past the last phase', () => {
    const action = decidePhase({
      phase: 'closing',
      elapsedMs: 56 * MINUTE,
      phaseStartedMs: 55 * MINUTE,
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
      'studyPlan',
      'motivation',
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
