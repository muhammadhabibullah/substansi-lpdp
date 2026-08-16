import { describe, expect, it } from 'vitest';

import {
  assertConfigured,
  extractJson,
  findPreset,
  isSameOriginAsBase,
  LlmError,
  normalizeBaseUrl,
  parseBaseUrl,
  PROVIDER_PRESETS,
  resolveSettings,
  toLlmError,
} from './llm';
import type { LlmSettings } from './types';

const settings: LlmSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-5-mini',
  cheapModel: '',
  temperature: 0.7,
  presetId: 'openai',
};

describe('normalizeBaseUrl / parseBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  https://api.openai.com/v1/  ')).toBe(
      'https://api.openai.com/v1',
    );
    expect(normalizeBaseUrl('https://x.dev///')).toBe('https://x.dev');
  });

  it('accepts http and https endpoints', () => {
    expect(parseBaseUrl('https://api.openai.com/v1')).not.toBeNull();
    expect(parseBaseUrl('http://localhost:11434/v1')).not.toBeNull();
  });

  it('rejects empty, malformed, and non-http schemes', () => {
    expect(parseBaseUrl('')).toBeNull();
    expect(parseBaseUrl('   ')).toBeNull();
    expect(parseBaseUrl('not a url')).toBeNull();
    expect(parseBaseUrl('ftp://example.com')).toBeNull();
    expect(parseBaseUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('isSameOriginAsBase (key-safety rule #1)', () => {
  const base = 'https://api.openai.com/v1';

  it('accepts the configured origin', () => {
    expect(isSameOriginAsBase('https://api.openai.com/v1/chat/completions', base)).toBe(
      true,
    );
  });

  it('accepts a different path on the same origin', () => {
    expect(isSameOriginAsBase('https://api.openai.com/other', base)).toBe(true);
  });

  it('rejects a different host', () => {
    expect(isSameOriginAsBase('https://evil.example.com/v1/chat', base)).toBe(false);
  });

  it('rejects a subdomain of the configured host', () => {
    expect(isSameOriginAsBase('https://evil.api.openai.com/v1', base)).toBe(false);
  });

  it('rejects a scheme downgrade', () => {
    expect(isSameOriginAsBase('http://api.openai.com/v1/chat', base)).toBe(false);
  });

  it('rejects a different port', () => {
    expect(isSameOriginAsBase('https://api.openai.com:8443/v1', base)).toBe(false);
  });

  it('distinguishes localhost ports for local providers', () => {
    const ollama = 'http://localhost:11434/v1';
    expect(isSameOriginAsBase('http://localhost:11434/v1/chat', ollama)).toBe(true);
    expect(isSameOriginAsBase('http://localhost:1234/v1/chat', ollama)).toBe(false);
  });

  it('returns false when the base URL is unusable', () => {
    expect(isSameOriginAsBase('https://api.openai.com/v1', '')).toBe(false);
    expect(isSameOriginAsBase('https://api.openai.com/v1', 'garbage')).toBe(false);
  });
});

describe('resolveSettings / assertConfigured', () => {
  it('falls back to the main model when no cheap model is set', () => {
    expect(resolveSettings(settings).cheapModel).toBe('gpt-5-mini');
  });

  it('keeps a distinct cheap model when provided', () => {
    const resolved = resolveSettings({ ...settings, cheapModel: 'gpt-4o-mini' });
    expect(resolved.cheapModel).toBe('gpt-4o-mini');
    expect(resolved.model).toBe('gpt-5-mini');
  });

  it('trims user input', () => {
    const resolved = resolveSettings({
      ...settings,
      baseUrl: '  https://api.openai.com/v1/ ',
      apiKey: '  sk-test  ',
      model: '  gpt-5-mini  ',
    });
    expect(resolved.baseUrl).toBe('https://api.openai.com/v1');
    expect(resolved.apiKey).toBe('sk-test');
    expect(resolved.model).toBe('gpt-5-mini');
  });

  it('passes a fully configured setting', () => {
    expect(() => assertConfigured(settings)).not.toThrow();
  });

  it('rejects a missing or invalid base URL', () => {
    expect(() => assertConfigured({ ...settings, baseUrl: '' })).toThrow(LlmError);
    expect(() => assertConfigured({ ...settings, baseUrl: 'nope' })).toThrow(LlmError);
  });

  it('rejects a missing model', () => {
    expect(() => assertConfigured({ ...settings, model: '   ' })).toThrow(LlmError);
  });

  it('allows an empty key for local endpoints', () => {
    expect(() =>
      assertConfigured({
        ...settings,
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
      }),
    ).not.toThrow();
  });
});

describe('toLlmError', () => {
  it('maps 401/403 to auth', () => {
    expect(toLlmError({ statusCode: 401, message: 'x' }).kind).toBe('auth');
    expect(toLlmError({ statusCode: 403, message: 'x' }).kind).toBe('auth');
  });

  it('maps 429 to rate-limit and marks it retryable', () => {
    const error = toLlmError({ statusCode: 429, message: 'slow down' });
    expect(error.kind).toBe('rate-limit');
    expect(error.retryable).toBe(true);
  });

  it('maps 5xx to network', () => {
    expect(toLlmError({ statusCode: 503, message: 'x' }).kind).toBe('network');
  });

  it('maps other 4xx to bad-response', () => {
    const error = toLlmError({ statusCode: 422, message: 'x' });
    expect(error.kind).toBe('bad-response');
    expect(error.retryable).toBe(false);
  });

  it('treats a TypeError as a network/CORS failure', () => {
    expect(toLlmError(new TypeError('Failed to fetch')).kind).toBe('network');
  });

  it('recognises aborts', () => {
    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    expect(toLlmError(abort).kind).toBe('aborted');
  });

  it('passes an existing LlmError through unchanged', () => {
    const original = new LlmError('auth', 'nope');
    expect(toLlmError(original)).toBe(original);
  });

  it('falls back to unknown', () => {
    expect(toLlmError({}).kind).toBe('unknown');
    expect(toLlmError('string error').kind).toBe('unknown');
  });
});

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON inside a markdown fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extracts JSON surrounded by prose', () => {
    expect(extractJson('Here you go:\n{"a":1}\nHope that helps!')).toEqual({ a: 1 });
  });

  it('parses arrays', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('handles nested objects with prose around them', () => {
    expect(extractJson('Result: {"a":{"b":[1,2]}} done')).toEqual({ a: { b: [1, 2] } });
  });

  it('returns undefined for empty or unparseable text', () => {
    expect(extractJson('')).toBeUndefined();
    expect(extractJson('   ')).toBeUndefined();
    expect(extractJson('no json here at all')).toBeUndefined();
  });
});

describe('provider presets (M6-3)', () => {
  it('includes the documented providers', () => {
    expect(PROVIDER_PRESETS.map((preset) => preset.id)).toEqual([
      'openai',
      'openrouter',
      'groq',
      'ollama',
      'lmstudio',
    ]);
  });

  it('suggests gpt-5-mini as the OpenAI default (PLAN §3)', () => {
    expect(findPreset('openai')?.suggestedModel).toBe('gpt-5-mini');
  });

  it('marks local providers as not requiring a key', () => {
    expect(findPreset('ollama')?.keyRequired).toBe(false);
    expect(findPreset('lmstudio')?.keyRequired).toBe(false);
    expect(findPreset('openai')?.keyRequired).toBe(true);
  });

  it('gives every preset a valid base URL and a model', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(parseBaseUrl(preset.baseUrl)).not.toBeNull();
      expect(preset.suggestedModel.length).toBeGreaterThan(0);
      expect(preset.suggestedCheapModel.length).toBeGreaterThan(0);
    }
  });

  it('returns undefined for an unknown preset id', () => {
    expect(findPreset('custom')).toBeUndefined();
  });
});
