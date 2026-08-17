import { describe, expect, it } from 'vitest';

import {
  addTurn,
  applyPhaseAction,
  createSession,
  detectLanguage,
  evaluatePhase,
  followCandidateLanguage,
  lastPanelistQuestion,
  pauseSession,
  planPanelistTurn,
  questionsInPhase,
  resumePausedSession,
  resumeSession,
  tickClock,
} from './engine';
import { HARD_STOP_MS } from './phases';
import { EMPTY_PROFILE, type InterviewSession, type Profile } from '../types';

const MINUTE = 60_000;

const profile: Profile = {
  ...EMPTY_PROFILE,
  name: 'Budi',
  jenjang: 'magister',
  englishSegments: true,
};

function session(): InterviewSession {
  return createSession({ profile, model: 'test-model', locale: 'id' });
}

describe('createSession', () => {
  it('starts in the opening phase with a clean clock', () => {
    const created = session();
    expect(created.phase).toBe('opening');
    expect(created.elapsedMs).toBe(0);
    expect(created.status).toBe('running');
    expect(created.turns).toEqual([]);
    expect(created.notes).toEqual([]);
    expect(created.lastSpeaker).toBeNull();
    expect(created.lang).toBe('id');
  });

  it('snapshots the profile and model', () => {
    const created = session();
    expect(created.profile.name).toBe('Budi');
    expect(created.model).toBe('test-model');
  });
});

describe('tickClock', () => {
  it('accumulates elapsed time while running', () => {
    const created = session();
    const ticked = tickClock(created, created.tickedAt + 30_000);
    expect(ticked.elapsedMs).toBe(30_000);
  });

  it('does not advance elapsed time once finished', () => {
    const created = { ...session(), status: 'finished' as const };
    const ticked = tickClock(created, created.tickedAt + 60_000);
    expect(ticked.elapsedMs).toBe(0);
  });

  it('never runs unboundedly past the hard stop', () => {
    const created = session();
    const ticked = tickClock(created, created.tickedAt + 10 * 60 * MINUTE);
    expect(ticked.elapsedMs).toBeLessThanOrEqual(HARD_STOP_MS + 60_000);
  });

  it('ignores a clock that jumped backwards', () => {
    const created = session();
    const ticked = tickClock(created, created.tickedAt - 60_000);
    expect(ticked.elapsedMs).toBe(0);
  });
});

describe('resumeSession (crash recovery, M3-6)', () => {
  it('does not charge the candidate for time the tab was closed', () => {
    const created = { ...session(), elapsedMs: 10 * MINUTE };
    // Simulate reopening an hour later.
    const stale = { ...created, tickedAt: Date.now() - 60 * MINUTE };
    const resumed = resumeSession(stale);
    const ticked = tickClock(resumed, resumed.tickedAt + 1000);

    expect(ticked.elapsedMs).toBe(10 * MINUTE + 1000);
  });
});

describe('pauseSession / resumePausedSession (P2-8)', () => {
  it('pauses a running session and freezes the clock', () => {
    const current = { ...session(), elapsedMs: 12 * MINUTE };
    const paused = pauseSession(current);
    expect(paused.status).toBe('paused');

    // Time spent paused never counts against the interview.
    const ticked = tickClock(paused, paused.tickedAt + 5 * MINUTE);
    expect(ticked.elapsedMs).toBe(12 * MINUTE);
  });

  it('can pause a session that is wrapping up', () => {
    const current = { ...session(), status: 'wrapping' as const };
    expect(pauseSession(current).status).toBe('paused');
  });

  it('leaves terminal sessions untouched', () => {
    for (const status of ['preparing', 'finished', 'aborted'] as const) {
      const current = { ...session(), status };
      expect(pauseSession(current)).toBe(current);
    }
  });

  it('does not charge time spent paused on resume', () => {
    const paused = pauseSession({ ...session(), elapsedMs: 10 * MINUTE });
    // Simulate resuming an hour after pausing.
    const stale = { ...paused, tickedAt: Date.now() - 60 * MINUTE };
    const resumed = resumePausedSession(stale);
    expect(resumed.status).toBe('running');

    const ticked = tickClock(resumed, resumed.tickedAt + 1000);
    expect(ticked.elapsedMs).toBe(10 * MINUTE + 1000);
  });

  it('leaves sessions that are not paused untouched on resume', () => {
    const current = session();
    expect(resumePausedSession(current)).toBe(current);
    const finished = { ...session(), status: 'finished' as const };
    expect(resumePausedSession(finished)).toBe(finished);
  });
});

describe('addTurn', () => {
  it('appends a turn with a generated id and the current elapsed time', () => {
    const base = { ...session(), elapsedMs: 90_000 };
    const { session: next, turn } = addTurn(base, {
      speaker: 'akademisi',
      text: 'Pertanyaan.',
      phase: 'opening',
      lang: 'id',
    });

    expect(next.turns).toHaveLength(1);
    expect(turn.id).toBeTruthy();
    expect(turn.atMs).toBe(90_000);
  });

  it('tracks the last panelist speaker but not the candidate', () => {
    let current = session();
    current = addTurn(current, {
      speaker: 'psikolog',
      text: 'q',
      phase: 'opening',
      lang: 'id',
    }).session;
    expect(current.lastSpeaker).toBe('psikolog');

    current = addTurn(current, {
      speaker: 'user',
      text: 'a',
      phase: 'opening',
      lang: 'id',
    }).session;
    // A candidate answer must not reset who spoke last on the panel.
    expect(current.lastSpeaker).toBe('psikolog');
  });
});

describe('questionsInPhase', () => {
  it('counts only panelist turns in the given phase', () => {
    let current = session();
    for (const speaker of ['akademisi', 'user', 'psikolog'] as const) {
      current = addTurn(current, {
        speaker,
        text: 'x',
        phase: 'opening',
        lang: 'id',
      }).session;
    }
    current = addTurn(current, {
      speaker: 'lpdp',
      text: 'x',
      phase: 'motivation',
      lang: 'id',
    }).session;

    expect(questionsInPhase(current, 'opening')).toBe(2);
    expect(questionsInPhase(current, 'motivation')).toBe(1);
  });
});

describe('evaluatePhase / applyPhaseAction', () => {
  it('resets the phase clock when advancing', () => {
    let current = { ...session(), elapsedMs: 6 * MINUTE };
    current = addTurn(current, {
      speaker: 'lpdp',
      text: 'q',
      phase: 'opening',
      lang: 'id',
    }).session;

    const action = evaluatePhase(current);
    expect(action.type).toBe('advance');

    const advanced = applyPhaseAction(current, action);
    expect(advanced.phase).toBe('studyPlan');
    expect(advanced.phaseStartedMs).toBe(6 * MINUTE);
  });

  it('marks the session wrapping on a finish action', () => {
    const current = { ...session(), elapsedMs: HARD_STOP_MS };
    const advanced = applyPhaseAction(current, evaluatePhase(current));
    expect(advanced.status).toBe('wrapping');
  });

  it('leaves the session untouched on stay', () => {
    const current = session();
    const advanced = applyPhaseAction(current, { type: 'stay', reason: 'x' });
    expect(advanced).toBe(current);
  });
});

describe('planPanelistTurn', () => {
  const decision = { panelist: 'akademisi' as const, directive: 'Gali metodologi.' };

  it('carries the moderator directive through', () => {
    const plan = planPanelistTurn(session(), decision);
    expect(plan.directive).toBe('Gali metodologi.');
    expect(plan.panelist).toBe('akademisi');
  });

  it('uses English for the Akademisi during the deep dive', () => {
    let current: InterviewSession = { ...session(), phase: 'studyPlan' };
    current = addTurn(current, {
      speaker: 'akademisi',
      text: 'q1',
      phase: 'studyPlan',
      lang: 'id',
    }).session;

    const plan = planPanelistTurn(current, decision);
    expect(plan.useEnglish).toBe(true);
    expect(plan.lang).toBe('en');
  });

  it('never switches to English for domestic applicants', () => {
    let current: InterviewSession = {
      ...createSession({
        profile: { ...profile, englishSegments: false },
        model: 'm',
        locale: 'id',
      }),
      phase: 'studyPlan',
    };
    current = addTurn(current, {
      speaker: 'akademisi',
      text: 'q1',
      phase: 'studyPlan',
      lang: 'id',
    }).session;

    expect(planPanelistTurn(current, decision).useEnglish).toBe(false);
  });

  it('applies wrap-up pressure near the time limit', () => {
    const current = { ...session(), elapsedMs: 56 * MINUTE };
    expect(planPanelistTurn(current, decision).wrapUp).toBe(true);
  });

  it('requests a closing statement when ending early', () => {
    const plan = planPanelistTurn(session(), decision, { endingEarly: true });
    expect(plan.requestClosingStatement).toBe(true);
    expect(plan.wrapUp).toBe(true);
  });

  it('requests a closing statement once the session is wrapping', () => {
    const current = { ...session(), status: 'wrapping' as const };
    expect(planPanelistTurn(current, decision).requestClosingStatement).toBe(true);
  });
});

describe('detectLanguage (M3-5)', () => {
  it('returns null for text too short to judge', () => {
    expect(detectLanguage('Ya, benar.')).toBeNull();
    expect(detectLanguage('')).toBeNull();
  });

  it('detects a clearly English answer', () => {
    expect(
      detectLanguage(
        'I would like to explain that my research is about the modelling of dengue outbreaks and this is important for my country',
      ),
    ).toBe('en');
  });

  it('detects a clearly Indonesian answer', () => {
    expect(
      detectLanguage(
        'Saya ingin menjelaskan bahwa penelitian ini adalah tentang pemodelan wabah dan hal itu penting untuk negara kami karena datanya belum ada',
      ),
    ).toBe('id');
  });

  it('returns null when neither language has a clear margin', () => {
    // Three Indonesian markers against three English ones: below the 2x margin
    // the detector requires, so the session language must not flip.
    expect(
      detectLanguage(
        'Saya rasa the framework that is dipakai adalah relevan for the konteks penelitian ini',
      ),
    ).toBeNull();
  });
});

describe('followCandidateLanguage', () => {
  it('switches the session language when the candidate switches', () => {
    const current = session();
    const next = followCandidateLanguage(
      current,
      'I would like to explain that my research is about the modelling of dengue outbreaks and this is important',
    );
    expect(next.lang).toBe('en');
  });

  it('leaves the language alone for a short or ambiguous answer', () => {
    const current = session();
    expect(followCandidateLanguage(current, 'Baik, siap.')).toBe(current);
  });
});

describe('lastPanelistQuestion', () => {
  it('finds the most recent panelist turn', () => {
    let current = session();
    current = addTurn(current, {
      speaker: 'akademisi',
      text: 'Pertanyaan pertama.',
      phase: 'opening',
      lang: 'id',
    }).session;
    current = addTurn(current, {
      speaker: 'lpdp',
      text: 'Pertanyaan kedua.',
      phase: 'opening',
      lang: 'id',
    }).session;
    current = addTurn(current, {
      speaker: 'user',
      text: 'Jawaban.',
      phase: 'opening',
      lang: 'id',
    }).session;

    expect(lastPanelistQuestion(current)).toBe('Pertanyaan kedua.');
  });

  it('returns an empty string when the panel has not spoken', () => {
    expect(lastPanelistQuestion(session())).toBe('');
  });
});
