import { describe, expect, it } from 'vitest';

import { fallbackDecision, type ModeratorContext } from './moderator';
import { getPhase, PHASES } from './phases';
import { EMPTY_PROFILE, type PhaseId, type Profile } from '../types';

const profile: Profile = { ...EMPTY_PROFILE, name: 'Budi', jenjang: 'magister' };

function context(over: Partial<ModeratorContext> = {}): ModeratorContext {
  return {
    phase: 'opening',
    elapsedMs: 0,
    remainingMs: 60 * 60_000,
    questionsInPhase: 0,
    lastSpeaker: null,
    history: [],
    profile,
    documents: {},
    ...over,
  };
}

describe('fallbackDecision (deterministic speaker rotation)', () => {
  it('picks the phase lead when nobody has spoken', () => {
    for (const phase of PHASES) {
      const decision = fallbackDecision(context({ phase: phase.id }));
      expect(decision.panelist).toBe(phase.lead);
      expect(decision.fallback).toBe(true);
    }
  });

  it('rotates away from whoever just spoke', () => {
    const phase = getPhase('studyPlan');
    const decision = fallbackDecision(
      context({ phase: 'studyPlan', lastSpeaker: phase.lead, questionsInPhase: 1 }),
    );
    expect(decision.panelist).not.toBe(phase.lead);
    expect(phase.participants).toContain(decision.panelist);
  });

  it('never picks a panelist who is not a participant of the phase', () => {
    for (const phase of PHASES) {
      for (let asked = 0; asked < 6; asked += 1) {
        for (const last of [null, 'akademisi', 'psikolog', 'lpdp'] as const) {
          const decision = fallbackDecision(
            context({ phase: phase.id, lastSpeaker: last, questionsInPhase: asked }),
          );
          expect(phase.participants).toContain(decision.panelist);
        }
      }
    }
  });

  it('always produces a non-empty directive', () => {
    for (const phase of PHASES) {
      for (let asked = 0; asked < 10; asked += 1) {
        const decision = fallbackDecision(
          context({ phase: phase.id, questionsInPhase: asked }),
        );
        expect(decision.directive.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('varies directives as a phase progresses', () => {
    const first = fallbackDecision(context({ phase: 'studyPlan', questionsInPhase: 0 }));
    const second = fallbackDecision(context({ phase: 'studyPlan', questionsInPhase: 1 }));
    expect(first.directive).not.toBe(second.directive);
  });

  it('asks for a closing statement late in the closing phase', () => {
    const decision = fallbackDecision(context({ phase: 'closing', questionsInPhase: 1 }));
    expect(decision.directive.toLowerCase()).toContain('closing statement');
  });

  it('mentions the proposal for doctoral applicants in the deep dive', () => {
    const decision = fallbackDecision(
      context({
        phase: 'studyPlan',
        questionsInPhase: 0,
        profile: { ...profile, jenjang: 'doktor' },
      }),
    );
    expect(decision.directive).toContain('Proposal Penelitian');
  });

  it('mentions the study plan for master applicants in the deep dive', () => {
    const decision = fallbackDecision(context({ phase: 'studyPlan', questionsInPhase: 0 }));
    expect(decision.directive).toContain('Rencana Studi');
  });

  it('adapts the readiness question to the study destination', () => {
    const overseas = fallbackDecision(
      context({
        phase: 'personality',
        questionsInPhase: 2,
        profile: { ...profile, tujuan: 'ln' },
      }),
    );
    expect(overseas.directive).toMatch(/jauh dari Indonesia/i);

    const domestic = fallbackDecision(
      context({
        phase: 'personality',
        questionsInPhase: 2,
        profile: { ...profile, tujuan: 'dn' },
      }),
    );
    expect(domestic.directive).not.toMatch(/jauh dari Indonesia/i);
  });

  it('is stable for identical input', () => {
    const args = context({ phase: 'contribution', questionsInPhase: 2 });
    expect(fallbackDecision(args)).toEqual(fallbackDecision(args));
  });

  it('handles a question count past the directive list length', () => {
    const decision = fallbackDecision(
      context({ phase: 'opening' as PhaseId, questionsInPhase: 99 }),
    );
    expect(decision.directive.trim().length).toBeGreaterThan(0);
  });
});
