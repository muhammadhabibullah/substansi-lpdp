import { describe, expect, it } from 'vitest';

import { describeLlmError, getCopy } from './i18n';
import { LlmError } from './llm';

const c = getCopy('id');

describe('describeLlmError', () => {
  it('maps known kinds onto localized copy and keeps the provider detail', () => {
    const providerMessage =
      'Rate limit reached for model `llama-3.3-70b-versatile`. Please try again in 14m6.72s.';
    const described = describeLlmError(new LlmError('rate-limit', providerMessage, 429), c);
    expect(described.summary).toBe(c.interview.rateLimited);
    expect(described.detail).toBe(providerMessage);
  });

  it('omits the detail when it repeats the summary', () => {
    const described = describeLlmError(
      new LlmError('rate-limit', c.interview.rateLimited),
      c,
    );
    expect(described.summary).toBe(c.interview.rateLimited);
    expect(described.detail).toBeUndefined();
  });

  it('falls back to the raw message for unknown kinds', () => {
    const described = describeLlmError(new LlmError('unknown', 'Model exploded'), c);
    expect(described.summary).toBe('Model exploded');
    expect(described.detail).toBeUndefined();
  });

  it('honors a screen-specific not-configured wording', () => {
    const described = describeLlmError(
      new LlmError('not-configured', 'Model is not set'),
      c,
      c.settings.testMissingFields,
    );
    expect(described.summary).toBe(c.settings.testMissingFields);
    expect(described.detail).toBe('Model is not set');
  });

  it('produces full copy for every locale', () => {
    for (const locale of ['id', 'en'] as const) {
      const copy = getCopy(locale);
      const described = describeLlmError(new LlmError('auth', 'Invalid key', 401), copy);
      expect(described.summary.length).toBeGreaterThan(0);
      expect(described.detail).toBe('Invalid key');
    }
  });
});
