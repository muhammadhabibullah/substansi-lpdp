import { describe, expect, it } from 'vitest';

import { DOC_CHAR_LIMITS } from './documents';
import { oversizedKinds } from './summarize';
import type { DocKind, DocumentSet, ParsedDoc } from './types';

function doc(kind: DocKind, length: number): ParsedDoc {
  const text = 'a'.repeat(length);
  return {
    kind,
    fileName: `${kind}.txt`,
    source: 'paste',
    text,
    charCount: text.length,
    parsedAt: 0,
  };
}

describe('oversizedKinds', () => {
  it('reports nothing for an empty set', () => {
    expect(oversizedKinds({})).toEqual([]);
  });

  it('ignores documents within their limit', () => {
    const documents: DocumentSet = {
      cv: doc('cv', DOC_CHAR_LIMITS.cv),
      essay: doc('essay', 100),
    };
    expect(oversizedKinds(documents)).toEqual([]);
  });

  it('flags only documents past their own limit', () => {
    const documents: DocumentSet = {
      cv: doc('cv', DOC_CHAR_LIMITS.cv + 1),
      essay: doc('essay', 100),
      studyPlan: doc('studyPlan', DOC_CHAR_LIMITS.studyPlan * 2),
    };
    expect(oversizedKinds(documents).sort()).toEqual(['cv', 'studyPlan']);
  });

  it('uses per-kind limits, not one global limit', () => {
    // A study plan of this length is fine, but a CV of the same length is not.
    const length = DOC_CHAR_LIMITS.cv + 1;
    expect(length).toBeLessThan(DOC_CHAR_LIMITS.studyPlan);

    expect(oversizedKinds({ studyPlan: doc('studyPlan', length) })).toEqual([]);
    expect(oversizedKinds({ cv: doc('cv', length) })).toEqual(['cv']);
  });
});
