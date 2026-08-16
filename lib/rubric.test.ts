import { describe, expect, it } from 'vitest';

import {
  BANDS,
  bandFor,
  buildDimensionResults,
  coerceScore,
  collectEvidence,
  DIMENSION_IDS,
  dimensionsOwnedBy,
  getDimension,
  isDimensionId,
  MAX_SCORE,
  RUBRIC,
  TOTAL_WEIGHT,
  totalScore,
  weightedPoints,
  type RawDimensionScore,
} from './rubric';
import type { AnswerNote, DimensionResult, Score } from './types';

describe('rubric table matches PLAN §5', () => {
  it('has eight dimensions', () => {
    expect(RUBRIC).toHaveLength(8);
    expect(DIMENSION_IDS).toHaveLength(8);
  });

  it('weights sum to exactly 100', () => {
    expect(TOTAL_WEIGHT).toBe(100);
  });

  it('uses the documented weights per dimension', () => {
    const weights = Object.fromEntries(RUBRIC.map((d) => [d.id, d.weight]));
    expect(weights).toEqual({
      studyPlan: 20,
      fieldMastery: 10,
      communication: 10,
      motivation: 10,
      resilience: 10,
      consistency: 10,
      nationalism: 15,
      contribution: 15,
    });
  });

  it('assigns ownership as PLAN §5 specifies', () => {
    const owners = Object.fromEntries(RUBRIC.map((d) => [d.id, d.owner]));
    expect(owners).toEqual({
      studyPlan: 'akademisi',
      fieldMastery: 'akademisi',
      communication: 'akademisi',
      motivation: 'psikolog',
      resilience: 'psikolog',
      consistency: 'psikolog',
      nationalism: 'lpdp',
      contribution: 'lpdp',
    });
  });

  it('splits ownership 3/3/2 across the panel', () => {
    expect(dimensionsOwnedBy('akademisi')).toHaveLength(3);
    expect(dimensionsOwnedBy('psikolog')).toHaveLength(3);
    expect(dimensionsOwnedBy('lpdp')).toHaveLength(2);
  });

  it('validates dimension ids', () => {
    expect(isDimensionId('studyPlan')).toBe(true);
    expect(isDimensionId('nope')).toBe(false);
    expect(isDimensionId(3)).toBe(false);
    expect(() => getDimension('bogus' as never)).toThrow();
  });
});

describe('coerceScore', () => {
  it('passes valid scores through', () => {
    expect(coerceScore(1)).toBe(1);
    expect(coerceScore(4)).toBe(4);
  });

  it('rounds fractional scores', () => {
    expect(coerceScore(2.4)).toBe(2);
    expect(coerceScore(2.6)).toBe(3);
  });

  it('parses numeric strings from model output', () => {
    expect(coerceScore('3')).toBe(3);
    expect(coerceScore('3.5')).toBe(4);
  });

  it('clamps out-of-range values', () => {
    expect(coerceScore(0)).toBe(0);
    expect(coerceScore(-5)).toBe(0);
    expect(coerceScore(9)).toBe(MAX_SCORE);
  });

  it('falls back to a neutral 2 for junk', () => {
    expect(coerceScore('excellent')).toBe(2);
    expect(coerceScore(null)).toBe(2);
    expect(coerceScore(undefined)).toBe(2);
    expect(coerceScore(Number.NaN)).toBe(2);
  });
});

describe('weightedPoints', () => {
  it('treats 1 as the floor and 4 as full marks', () => {
    expect(weightedPoints(1, 20)).toBe(0);
    expect(weightedPoints(4, 20)).toBe(20);
  });

  it('gives an untested dimension (0) zero points too', () => {
    expect(weightedPoints(0, 20)).toBe(0);
    expect(weightedPoints(0, 15)).toBe(0);
  });

  it('spaces intermediate scores evenly', () => {
    expect(weightedPoints(2, 30)).toBeCloseTo(10);
    expect(weightedPoints(3, 30)).toBeCloseTo(20);
  });
});

describe('totalScore', () => {
  const allAt = (score: Score): DimensionResult[] =>
    RUBRIC.map((dimension) => ({
      id: dimension.id,
      score,
      weighted: weightedPoints(score, dimension.weight),
      justification: '',
      quotes: [],
      strengths: [],
      improvements: [],
    }));

  it('gives 0/100 when every dimension is the floor', () => {
    expect(totalScore(allAt(1))).toBe(0);
  });

  it('gives 0/100 when every dimension was never tested', () => {
    expect(totalScore(allAt(0))).toBe(0);
  });

  it('gives 100/100 when every dimension is full marks', () => {
    expect(totalScore(allAt(4))).toBe(100);
  });

  it('gives ~33 for straight 2s and ~67 for straight 3s', () => {
    expect(totalScore(allAt(2))).toBe(33);
    expect(totalScore(allAt(3))).toBe(67);
  });
});

describe('bandFor', () => {
  it('maps scores onto the four bands', () => {
    expect(bandFor(100)).toBe('sangat');
    expect(bandFor(85)).toBe('sangat');
    expect(bandFor(84)).toBe('direkomendasikan');
    expect(bandFor(70)).toBe('direkomendasikan');
    expect(bandFor(69)).toBe('dipertimbangkan');
    expect(bandFor(55)).toBe('dipertimbangkan');
    expect(bandFor(54)).toBe('belum');
    expect(bandFor(0)).toBe('belum');
  });

  it('clamps nonsense input', () => {
    expect(bandFor(-20)).toBe('belum');
    expect(bandFor(1000)).toBe('sangat');
  });

  it('orders band thresholds descending and covers zero', () => {
    const mins = BANDS.map((band) => band.min);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
    expect(mins.at(-1)).toBe(0);
  });
});

describe('buildDimensionResults', () => {
  it('fills omitted dimensions with the floor score', () => {
    const raw: RawDimensionScore[] = [
      { id: 'studyPlan', score: 4, justification: 'kuat' },
    ];
    const results = buildDimensionResults(raw, 'fallback');

    expect(results).toHaveLength(8);
    expect(results.find((r) => r.id === 'studyPlan')).toMatchObject({
      score: 4,
      justification: 'kuat',
    });
    // Every other dimension defaults to 1 (untested floor), never a neutral 2.
    for (const result of results.filter((r) => r.id !== 'studyPlan')) {
      expect(result.score).toBe(1);
      expect(result.justification).toBe('fallback');
      expect(result.weighted).toBe(0);
    }
  });

  it('always returns all dimensions in canonical order', () => {
    const results = buildDimensionResults([], 'x');
    expect(results.map((r) => r.id)).toEqual(RUBRIC.map((d) => d.id));
  });

  it('ignores unknown dimension ids from the model', () => {
    const raw = [
      { id: 'hallucinated', score: 4, justification: 'x' },
      { id: 'motivation', score: 3, justification: 'ok' },
    ] as unknown as RawDimensionScore[];
    const results = buildDimensionResults(raw, 'fallback');
    expect(results.find((r) => r.id === 'motivation')?.score).toBe(3);
    expect(results).toHaveLength(8);
  });

  it('dedupes and trims quote/strength lists', () => {
    const raw: RawDimensionScore[] = [
      {
        id: 'contribution',
        score: 3,
        justification: 'ok',
        quotes: ['  sama  ', 'sama', 'beda', ''],
        strengths: ['a', 'a'],
      },
    ];
    const result = buildDimensionResults(raw, 'f').find((r) => r.id === 'contribution');
    expect(result?.quotes).toEqual(['sama', 'beda']);
    expect(result?.strengths).toEqual(['a']);
  });

  it('computes weighted points consistent with the weights', () => {
    const raw: RawDimensionScore[] = [
      { id: 'studyPlan', score: 4, justification: '' },
    ];
    const result = buildDimensionResults(raw, 'f').find((r) => r.id === 'studyPlan');
    expect(result?.weighted).toBe(20);
  });
});

describe('collectEvidence', () => {
  const note = (over: Partial<AnswerNote>): AnswerNote => ({
    turnId: 't1',
    question: 'q',
    phase: 'contribution',
    dimensions: ['contribution'],
    strengths: [],
    weaknesses: [],
    quotes: [],
    ...over,
  });

  it('returns a bucket for every dimension', () => {
    const evidence = collectEvidence([]);
    expect(Object.keys(evidence).sort()).toEqual([...DIMENSION_IDS].sort());
  });

  it('routes notes into their tagged dimensions', () => {
    const evidence = collectEvidence([
      note({ dimensions: ['contribution'], strengths: ['punya angka'], quotes: ['200 guru'] }),
      note({ dimensions: ['nationalism'], weaknesses: ['masih slogan'] }),
    ]);

    expect(evidence.contribution.strengths).toEqual(['punya angka']);
    expect(evidence.contribution.quotes).toEqual(['200 guru']);
    expect(evidence.nationalism.weaknesses).toEqual(['masih slogan']);
    expect(evidence.motivation.strengths).toEqual([]);
  });

  it('fans one note out to several dimensions', () => {
    const evidence = collectEvidence([
      note({ dimensions: ['contribution', 'nationalism'], strengths: ['konkret'] }),
    ]);
    expect(evidence.contribution.strengths).toEqual(['konkret']);
    expect(evidence.nationalism.strengths).toEqual(['konkret']);
  });

  it('dedupes repeated evidence across notes', () => {
    const evidence = collectEvidence([
      note({ strengths: ['sama'] }),
      note({ strengths: ['sama'] }),
    ]);
    expect(evidence.contribution.strengths).toEqual(['sama']);
  });

  it('ignores invalid dimension tags', () => {
    const evidence = collectEvidence([
      note({ dimensions: ['bogus'] as never, strengths: ['x'] }),
    ]);
    for (const id of DIMENSION_IDS) {
      expect(evidence[id].strengths).toEqual([]);
    }
  });
});
