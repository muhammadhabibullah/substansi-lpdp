import { describe, expect, it } from 'vitest';

import {
  applyInterjectionCap,
  fallbackDecision,
  interjectionsInBlock,
  MAX_INTERJECTIONS_PER_BLOCK,
  type ModeratorContext,
} from './moderator';
import { getPhase, PHASES } from './phases';
import {
  EMPTY_PROFILE,
  type PanelistId,
  type PhaseId,
  type Profile,
  type TranscriptTurn,
} from '../types';

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

  it('keeps the floor with the lead once every interjection is used', () => {
    const phase = getPhase('studyPlan');
    const decision = fallbackDecision(
      context({
        phase: 'studyPlan',
        lastSpeaker: phase.lead,
        questionsInPhase: 4,
        history: [
          question('psikolog', 'opening'),
          question('lpdp', 'studyPlan'),
        ],
      }),
    );
    expect(decision.panelist).toBe(phase.lead);
  });

  it('only rotates to participants with interjection budget left', () => {
    const phase = getPhase('studyPlan');
    for (let asked = 0; asked < 6; asked += 1) {
      const decision = fallbackDecision(
        context({
          phase: 'studyPlan',
          lastSpeaker: phase.lead,
          questionsInPhase: asked,
          history: [question('psikolog', 'opening')],
        }),
      );
      expect(decision.panelist).toBe('lpdp');
    }
  });
});

/* ── Strict one-interjection-per-block cap ─────────────────────────────── */

function question(speaker: PanelistId, phase: PhaseId): TranscriptTurn {
  return {
    id: `${speaker}-${phase}`,
    atMs: 0,
    speaker,
    text: 'Pertanyaan.',
    phase,
    lang: 'id',
  };
}

describe('interjectionsInBlock', () => {
  it('counts a panelist question in every phase of the current lead block', () => {
    // opening and studyPlan are both led by the Akademisi, so one question
    // in each still counts as two interjections in the same block.
    const ctx = context({
      phase: 'studyPlan',
      history: [question('psikolog', 'opening'), question('psikolog', 'studyPlan')],
    });
    expect(interjectionsInBlock(ctx, 'psikolog')).toBe(2);
  });

  it('does not count questions from other blocks', () => {
    const ctx = context({
      phase: 'studyPlan',
      history: [question('psikolog', 'motivation')],
    });
    expect(interjectionsInBlock(ctx, 'psikolog')).toBe(0);
  });

  it('never counts the block lead as an interjector', () => {
    const ctx = context({
      phase: 'studyPlan',
      history: [question('akademisi', 'opening'), question('akademisi', 'studyPlan')],
    });
    expect(interjectionsInBlock(ctx, 'akademisi')).toBe(0);
  });
});

describe('applyInterjectionCap', () => {
  const directive = 'Gali metodologi.';

  it('lets the block lead speak without limit', () => {
    const ctx = context({
      phase: 'studyPlan',
      history: [
        question('akademisi', 'opening'),
        question('akademisi', 'studyPlan'),
        question('akademisi', 'studyPlan'),
      ],
    });
    const decision = applyInterjectionCap(ctx, { panelist: 'akademisi', directive });
    expect(decision.panelist).toBe('akademisi');
  });

  it('lets a panelist with no interjection yet speak', () => {
    const ctx = context({ phase: 'motivation', history: [] });
    const decision = applyInterjectionCap(ctx, { panelist: 'akademisi', directive });
    expect(decision.panelist).toBe('akademisi');
  });

  it('redirects an exhausted interjector to the block lead, keeping the directive', () => {
    const ctx = context({
      phase: 'personality',
      history: [question('akademisi', 'motivation')],
    });
    const decision = applyInterjectionCap(ctx, { panelist: 'akademisi', directive });
    expect(decision.panelist).toBe('psikolog');
    expect(decision.directive).toBe(directive);
  });

  it('treats one question in an earlier phase of the same block as used up', () => {
    const ctx = context({
      phase: 'closing',
      history: [question('psikolog', 'contribution')],
    });
    const decision = applyInterjectionCap(ctx, { panelist: 'psikolog', directive });
    expect(decision.panelist).toBe('lpdp');
  });

  it('caps at exactly MAX_INTERJECTIONS_PER_BLOCK', () => {
    expect(MAX_INTERJECTIONS_PER_BLOCK).toBe(1);
  });
});
