import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertConfigured,
  complete,
  dropTemperatureField,
  extractJson,
  findPreset,
  guardedFetch,
  isMaxTokensUnsupportedError,
  isReasoningOnlyModel,
  isSameOriginAsBase,
  isTemperatureUnsupportedError,
  LlmError,
  normalizeBaseUrl,
  parseBaseUrl,
  PROVIDER_PRESETS,
  renameMaxTokensField,
  resolveSettings,
  RESPONSE_TIMEOUT_MS,
  sanitizeReasoningModelBody,
  streamComplete,
  toLlmError,
  TRUNCATION_RETRY_MAX_TOKENS,
  truncatedRetryBudget,
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

describe('guardedFetch privacy guard (composes isSameOriginAsBase)', () => {
  const baseUrl = 'https://api.openai.com/v1';
  const credentialHeaders = {
    Authorization: 'Bearer sk-secret',
    'api-key': 'sk-secret',
    'X-Custom': 'keep-me',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Captures the URL and RequestInit handed to the real fetch call. */
  const captureFetch = () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      captured.init = init;
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    return { fetchMock, captured };
  };

  it('preserves Authorization and api-key on a same-origin request', async () => {
    const { fetchMock, captured } = captureFetch();
    vi.stubGlobal('fetch', fetchMock);

    await guardedFetch(baseUrl)(`${baseUrl}/chat/completions`, {
      headers: credentialHeaders,
    });

    const headers = new Headers(captured.init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer sk-secret');
    expect(headers.get('api-key')).toBe('sk-secret');
    // Non-credential headers are untouched.
    expect(headers.get('X-Custom')).toBe('keep-me');
  });

  it('strips Authorization and api-key on a cross-origin request', async () => {
    const { fetchMock, captured } = captureFetch();
    vi.stubGlobal('fetch', fetchMock);

    await guardedFetch(baseUrl)('https://evil.example.com/v1/chat/completions', {
      headers: credentialHeaders,
    });

    const headers = new Headers(captured.init?.headers);
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('api-key')).toBeNull();
    // Stripping is surgical: everything else survives.
    expect(headers.get('X-Custom')).toBe('keep-me');
  });

  it('forces redirect: "error" so a cross-origin redirect never carries the key', async () => {
    const { fetchMock, captured } = captureFetch();
    vi.stubGlobal('fetch', fetchMock);

    await guardedFetch(baseUrl)(`${baseUrl}/chat/completions`, {
      headers: credentialHeaders,
      redirect: 'follow', // a caller preference must be overridden
    });

    expect(captured.init?.redirect).toBe('error');
  });

  it('treats a relative-path request as same-origin against the base', async () => {
    const { fetchMock, captured } = captureFetch();
    vi.stubGlobal('fetch', fetchMock);

    // new URL('/chat/completions', baseUrl) resolves onto the base origin.
    await guardedFetch(baseUrl)('/chat/completions', {
      headers: credentialHeaders,
    });

    const headers = new Headers(captured.init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer sk-secret');
    expect(headers.get('api-key')).toBe('sk-secret');
    expect(captured.url).toBe('/chat/completions');
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

  it('rejects an empty key for remote endpoints', () => {
    expect(() => assertConfigured({ ...settings, apiKey: '' })).toThrow(LlmError);
    expect(() => assertConfigured({ ...settings, apiKey: '   ' })).toThrow(LlmError);
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

  it('keeps the provider message verbatim for status-coded errors', () => {
    const error = toLlmError({
      statusCode: 429,
      message:
        'Rate limit reached for model `llama-3.3-70b-versatile`. Please try again in 14m6.72s.',
    });
    expect(error.kind).toBe('rate-limit');
    expect(error.status).toBe(429);
    expect(error.message).toContain('Rate limit reached');
  });

  it('keeps bare string errors verbatim and classifies rate-limit phrasing', () => {
    const text = 'Rate limit reached for model `x` in organization `y`';
    const error = toLlmError(text);
    expect(error.kind).toBe('rate-limit');
    expect(error.message).toBe(text);
    expect(toLlmError('boom').message).toBe('boom');
  });

  it('extracts the message from a nested error payload', () => {
    const error = toLlmError({
      error: {
        message: 'Model is overloaded',
        type: 'server',
        code: 'overloaded',
      },
    });
    expect(error.kind).toBe('unknown');
    expect(error.message).toBe('Model is overloaded');
  });

  it('unwraps the SDK RetryError to the original provider failure', () => {
    const error = toLlmError({
      name: 'RetryError',
      message: 'Failed after 2 attempts. Last error: Rate limit reached.',
      lastError: { statusCode: 429, message: 'Rate limit reached for model `x`.' },
    });
    expect(error.kind).toBe('rate-limit');
    expect(error.status).toBe(429);
    expect(error.message).toContain('Rate limit reached');
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

describe('isMaxTokensUnsupportedError', () => {
  it('recognises the real OpenAI error message', () => {
    expect(
      isMaxTokensUnsupportedError(
        "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
      ),
    ).toBe(true);
  });

  it('recognises the message wrapped in an OpenAI error envelope', () => {
    const body = JSON.stringify({
      error: {
        message:
          "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
        type: 'invalid_request_error',
        param: 'max_tokens',
        code: 'unsupported_parameter',
      },
    });
    expect(isMaxTokensUnsupportedError(body)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(
      isMaxTokensUnsupportedError(
        "UNSUPPORTED PARAMETER: 'MAX_TOKENS' IS NOT SUPPORTED. USE 'MAX_COMPLETION_TOKENS' INSTEAD.",
      ),
    ).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isMaxTokensUnsupportedError('Invalid API key provided')).toBe(false);
    expect(isMaxTokensUnsupportedError('Rate limit exceeded')).toBe(false);
    expect(isMaxTokensUnsupportedError('')).toBe(false);
  });

  it('does not match a message that only mentions one of the two names', () => {
    expect(isMaxTokensUnsupportedError("Unsupported parameter: 'max_tokens'")).toBe(false);
  });
});

describe('renameMaxTokensField', () => {
  it('renames max_tokens to max_completion_tokens', () => {
    const patched = renameMaxTokensField(
      JSON.stringify({ model: 'gpt-5-mini', max_tokens: 700, messages: [] }),
    );
    expect(JSON.parse(patched!)).toEqual({
      model: 'gpt-5-mini',
      messages: [],
      max_completion_tokens: 700,
    });
  });

  it('preserves every other field untouched', () => {
    const patched = renameMaxTokensField(
      JSON.stringify({ model: 'x', temperature: 0.7, stream: true, max_tokens: 16 }),
    );
    const parsed = JSON.parse(patched!);
    expect(parsed.temperature).toBe(0.7);
    expect(parsed.stream).toBe(true);
    expect(parsed.max_tokens).toBeUndefined();
  });

  it('returns null when there is no max_tokens field', () => {
    expect(renameMaxTokensField(JSON.stringify({ model: 'x' }))).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(renameMaxTokensField('not json')).toBeNull();
  });
});

describe('isTemperatureUnsupportedError', () => {
  it('recognises the real OpenAI error message', () => {
    expect(
      isTemperatureUnsupportedError(
        "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.",
      ),
    ).toBe(true);
  });

  it('recognises the message wrapped in an OpenAI error envelope', () => {
    const body = JSON.stringify({
      error: {
        message:
          "Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported.",
        type: 'invalid_request_error',
        param: 'temperature',
        code: 'unsupported_value',
      },
    });
    expect(isTemperatureUnsupportedError(body)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(
      isTemperatureUnsupportedError(
        "UNSUPPORTED VALUE: 'TEMPERATURE' DOES NOT SUPPORT 0 WITH THIS MODEL. ONLY THE DEFAULT (1) VALUE IS SUPPORTED.",
      ),
    ).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isTemperatureUnsupportedError('Invalid API key provided')).toBe(false);
    expect(isTemperatureUnsupportedError('Rate limit exceeded')).toBe(false);
    expect(
      isTemperatureUnsupportedError(
        "Unsupported parameter: 'max_tokens' is not supported with this model.",
      ),
    ).toBe(false);
    expect(isTemperatureUnsupportedError('')).toBe(false);
  });
});

describe('dropTemperatureField', () => {
  it('drops temperature and preserves every other field', () => {
    const patched = dropTemperatureField(
      JSON.stringify({ model: 'gpt-5-mini', temperature: 0, max_tokens: 16, messages: [] }),
    );
    expect(JSON.parse(patched!)).toEqual({
      model: 'gpt-5-mini',
      max_tokens: 16,
      messages: [],
    });
  });

  it('returns null when there is no temperature field', () => {
    expect(dropTemperatureField(JSON.stringify({ model: 'x' }))).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(dropTemperatureField('not json')).toBeNull();
  });
});

describe('isReasoningOnlyModel', () => {
  it('matches the gpt-5 family', () => {
    expect(isReasoningOnlyModel('gpt-5')).toBe(true);
    expect(isReasoningOnlyModel('gpt-5-mini')).toBe(true);
    expect(isReasoningOnlyModel('gpt-5-chat-latest')).toBe(true);
  });

  it('matches the o1/o3/o4 reasoning series', () => {
    expect(isReasoningOnlyModel('o1')).toBe(true);
    expect(isReasoningOnlyModel('o1-preview')).toBe(true);
    expect(isReasoningOnlyModel('o3')).toBe(true);
    expect(isReasoningOnlyModel('o3-2025-04-16')).toBe(true);
    expect(isReasoningOnlyModel('o4-mini')).toBe(true);
  });

  it('tolerates provider prefixes and casing', () => {
    expect(isReasoningOnlyModel('openai/gpt-5-mini')).toBe(true);
    expect(isReasoningOnlyModel('openrouter/openai/o3')).toBe(true);
    expect(isReasoningOnlyModel('GPT-5-MINI')).toBe(true);
  });

  it('does not match classic or unrelated models', () => {
    expect(isReasoningOnlyModel('gpt-4o')).toBe(false);
    expect(isReasoningOnlyModel('gpt-4o-mini')).toBe(false);
    expect(isReasoningOnlyModel('gpt-5000')).toBe(false);
    expect(isReasoningOnlyModel('o15')).toBe(false);
    expect(isReasoningOnlyModel('llama-3.3-70b-versatile')).toBe(false);
    expect(isReasoningOnlyModel('koala-13b')).toBe(false);
    expect(isReasoningOnlyModel('')).toBe(false);
  });
});

describe('sanitizeReasoningModelBody', () => {
  it('renames max_tokens and drops temperature for a reasoning model', () => {
    const patched = sanitizeReasoningModelBody(
      JSON.stringify({ model: 'gpt-5-mini', max_tokens: 700, temperature: 0.7, messages: [] }),
    );
    expect(JSON.parse(patched!)).toEqual({
      model: 'gpt-5-mini',
      max_completion_tokens: 700,
      messages: [],
    });
  });

  it('leaves classic models untouched', () => {
    expect(
      sanitizeReasoningModelBody(JSON.stringify({ model: 'gpt-4o', max_tokens: 700 })),
    ).toBeNull();
    expect(
      sanitizeReasoningModelBody(
        JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.7 }),
      ),
    ).toBeNull();
  });

  it('returns null when nothing needs patching', () => {
    expect(sanitizeReasoningModelBody(JSON.stringify({ model: 'gpt-5-mini' }))).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(sanitizeReasoningModelBody('not json')).toBeNull();
  });
});

describe('complete() self-heals from the max_tokens/max_completion_tokens mismatch', () => {
  // A model the proactive layer does not know, so the reactive layer is tested.
  const quirkyServerSettings: LlmSettings = { ...settings, model: 'gpt-4o' };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries once with max_completion_tokens and returns the successful reply', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));

      if (callCount === 1) {
        // First attempt: the SDK always sends the legacy field name.
        expect(body.max_tokens).toBeDefined();
        expect(body.max_completion_tokens).toBeUndefined();
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
              type: 'invalid_request_error',
              param: 'max_tokens',
              code: 'unsupported_parameter',
            },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }

      // Retry: the field must have been renamed, with the same value.
      expect(body.max_completion_tokens).toBe(16);
      expect(body.max_tokens).toBeUndefined();
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-5-mini',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const reply = await complete({
      settings: quirkyServerSettings,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 16,
    });

    expect(reply).toBe('OK');
    expect(callCount).toBe(2);
  });

  it('does not retry a plain 400 that is unrelated to max_tokens', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      return new Response(
        JSON.stringify({ error: { message: 'Invalid API key provided', type: 'invalid_request_error' } }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      complete({
        settings: quirkyServerSettings,
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 16,
      }),
    ).rejects.toMatchObject({ kind: 'auth' });

    // No retry: a single request should have been made.
    expect(callCount).toBe(1);
  });

  it('self-heals the same way for streaming panelist turns', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));

      if (callCount === 1) {
        expect(body.max_tokens).toBeDefined();
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
            },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }

      expect(body.max_completion_tokens).toBe(700);
      const sse = [
        `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'gpt-5-mini', choices: [{ index: 0, delta: { content: 'Halo kandidat.' }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'gpt-5-mini', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('');
      return new Response(sse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    const text = await streamComplete({
      settings: quirkyServerSettings,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 700,
      onDelta: (delta) => deltas.push(delta),
    });

    expect(text).toBe('Halo kandidat.');
    expect(callCount).toBe(2);
  });
});

describe('streamComplete truncation recovery (finishReason "length")', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** OpenAI-compatible SSE ending with the given finish reason. */
  const sseStream = (content: string, finishReason: string): string =>
    [
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'gpt-5-mini', choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'gpt-5-mini', choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\n`,
      'data: [DONE]\n\n',
    ].join('');

  it('doubles the budget for the retry budget helper, capped', () => {
    expect(truncatedRetryBudget(700)).toBe(1400);
    expect(truncatedRetryBudget(1500)).toBe(3000);
    expect(truncatedRetryBudget(TRUNCATION_RETRY_MAX_TOKENS)).toBe(
      TRUNCATION_RETRY_MAX_TOKENS,
    );
  });

  it('retries once with a doubled budget when the stream hits the token cap', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));
      // gpt-5-mini is proactively sanitized to max_completion_tokens.
      if (callCount === 1) {
        expect(body.max_completion_tokens).toBe(1500);
        return new Response(sseStream('Apa rencana ', 'length'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      expect(body.max_completion_tokens).toBe(3000);
      return new Response(sseStream('Apa rencana studi Anda?', 'stop'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    let resets = 0;
    const text = await streamComplete({
      settings,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 1500,
      onDelta: (delta) => deltas.push(delta),
      onTruncationRetry: () => {
        resets += 1;
        deltas.length = 0; // caller resets its live buffer
      },
    });

    expect(text).toBe('Apa rencana studi Anda?');
    expect(callCount).toBe(2);
    expect(resets).toBe(1);
    expect(deltas.join('')).toBe('Apa rencana studi Anda?');
  });

  it('surfaces the recovery card when the retry is still truncated', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(sseStream('Apa rencana ', 'length'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      streamComplete({
        settings,
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1500,
      }),
    ).rejects.toMatchObject({ kind: 'bad-response' });

    // Exactly one retry, no more.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('streamComplete surfaces provider errors to the caller', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const GROQ_RATE_LIMIT =
    'Rate limit reached for model `llama-3.3-70b-versatile` in organization ' +
    '`org_01` service tier `on_demand` on tokens per day (TPD): Limit 100000, ' +
    'Used 95431, Requested 5549. Please try again in 14m6.72s.';

  it('maps a 429 error response onto a retryable rate-limit with the provider message', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: GROQ_RATE_LIMIT,
              type: 'tokens',
              code: 'rate_limit_exceeded',
            },
          }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    let surfaced: LlmError | undefined;
    try {
      await streamComplete({
        settings,
        messages: [{ role: 'user', content: 'ping' }],
      });
    } catch (caught) {
      surfaced = toLlmError(caught);
    }

    expect(surfaced?.kind).toBe('rate-limit');
    expect(surfaced?.status).toBe(429);
    expect(surfaced?.message).toContain('Rate limit reached');
    expect(surfaced?.retryable).toBe(true);
  });

  it('rethrows provider errors reported mid-stream instead of dropping them', async () => {
    const sse = [
      `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'llama-3.3-70b-versatile', choices: [{ index: 0, delta: { content: 'Halo' }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ error: { message: GROQ_RATE_LIMIT, type: 'tokens', code: 'rate_limit_exceeded' } })}\n\n`,
    ].join('');
    const fetchMock = vi.fn(
      async () =>
        new Response(sse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    let surfaced: LlmError | undefined;
    try {
      await streamComplete({
        settings,
        messages: [{ role: 'user', content: 'ping' }],
      });
    } catch (caught) {
      surfaced = toLlmError(caught);
    }

    expect(surfaced).toBeDefined();
    expect(surfaced?.kind).toBe('rate-limit');
    expect(surfaced?.message).toContain('Rate limit reached');
  });
});

describe('response timeout (waiting for the endpoint to start answering)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** A fetch that hangs until its signal aborts, like a stalled endpoint. */
  const makeAbortError = () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    return abortError;
  };
  const stalledFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      signal?.addEventListener('abort', () => reject(makeAbortError()));
    });
  });

  it('surfaces a stalled endpoint as a retryable network error ("Coba lagi")', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalledFetch);

    const pending = complete({
      settings,
      messages: [{ role: 'user', content: 'ping' }],
    });
    pending.catch(() => undefined); // keep the rejection observed for vitest
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'network' });

    // Nothing yet just before the deadline; the error appears right after it.
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS - 1);
    await vi.advanceTimersByTimeAsync(2);
    await assertion;

    let surfaced: LlmError | undefined;
    await pending.catch((caught: unknown) => {
      surfaced = toLlmError(caught);
    });
    expect(surfaced?.retryable).toBe(true);
  });

  it('keeps a caller-initiated abort silent (no error card)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalledFetch);

    const controller = new AbortController();
    const pending = complete({
      settings,
      messages: [{ role: 'user', content: 'ping' }],
      signal: controller.signal,
    });
    pending.catch(() => undefined); // keep the rejection observed for vitest
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('gives each self-healing retry its own full timeout window', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (callCount === 1) {
        // Force one quirk retry against an unknown model.
        expect(body.max_tokens).toBeDefined();
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
            },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      // Second attempt stalls — it must only give up after a *fresh* full
      // window, not the time already spent on attempt one.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(makeAbortError()));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = complete({
      settings: { ...settings, model: 'gpt-4o' },
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 16,
    });
    pending.catch(() => undefined); // keep the rejection observed for vitest
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'network' });

    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 10);
    await assertion;
    expect(callCount).toBe(2);
  });
});

describe('complete() proactively sanitizes known reasoning models (no retry needed)', () => {
  const gptFiveSettings: LlmSettings = { ...settings, model: 'gpt-5-mini' };

  const okReply = JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-5-mini',
    choices: [
      { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
    ],
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends max_completion_tokens and no temperature on the very first attempt', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.max_completion_tokens).toBe(16);
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('temperature');
      return new Response(okReply, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const reply = await complete({
      settings: gptFiveSettings,
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
      maxTokens: 16,
    });

    expect(reply).toBe('OK');
    // No failed round-trip: exactly one request.
    expect(callCount).toBe(1);
  });

  it('sanitizes streaming panelist turns the same way', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.max_completion_tokens).toBe(700);
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('temperature');
      const sse = [
        `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'gpt-5-mini', choices: [{ index: 0, delta: { content: 'Halo kandidat.' }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'gpt-5-mini', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('');
      return new Response(sse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await streamComplete({
      settings: gptFiveSettings,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 700,
    });

    expect(text).toBe('Halo kandidat.');
    expect(callCount).toBe(1);
  });

  it('also sanitizes provider-prefixed model ids (OpenRouter style)', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.max_completion_tokens).toBe(16);
      expect(body).not.toHaveProperty('max_tokens');
      return new Response(okReply, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await complete({
      settings: { ...gptFiveSettings, model: 'openai/gpt-5-mini' },
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 16,
    });

    expect(callCount).toBe(1);
  });
});

describe('complete() self-heals from a rejected temperature (gpt-5/o-series)', () => {
  const quirkyServerSettings: LlmSettings = { ...settings, model: 'gpt-4o' };

  const temperatureErrorBody = JSON.stringify({
    error: {
      message:
        "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.",
      type: 'invalid_request_error',
      param: 'temperature',
      code: 'unsupported_value',
    },
  });

  const okReply = JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-5-mini',
    choices: [
      { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
    ],
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries once without temperature and returns the successful reply', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));

      if (callCount === 1) {
        // First attempt carries the configured temperature.
        expect(body.temperature).toBe(0);
        return new Response(temperatureErrorBody, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Retry: temperature must have been dropped entirely.
      expect(body).not.toHaveProperty('temperature');
      return new Response(okReply, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const reply = await complete({
      settings: quirkyServerSettings,
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
      maxTokens: 16,
    });

    expect(reply).toBe('OK');
    expect(callCount).toBe(2);
  });

  it('self-heals a request that trips both quirks in sequence', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));

      if (callCount === 1) {
        expect(body.max_tokens).toBeDefined();
        expect(body.temperature).toBe(0);
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
            },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      if (callCount === 2) {
        expect(body.max_completion_tokens).toBe(16);
        expect(body.temperature).toBe(0);
        return new Response(temperatureErrorBody, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      expect(body.max_completion_tokens).toBe(16);
      expect(body).not.toHaveProperty('temperature');
      return new Response(okReply, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const reply = await complete({
      settings: quirkyServerSettings,
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
      maxTokens: 16,
    });

    expect(reply).toBe('OK');
    expect(callCount).toBe(3);
  });

  it('self-heals the same way for streaming panelist turns', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));

      if (callCount === 1) {
        expect(body.temperature).toBeDefined();
        return new Response(temperatureErrorBody, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      expect(body).not.toHaveProperty('temperature');
      const sse = [
        `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'gpt-5-mini', choices: [{ index: 0, delta: { content: 'Halo kandidat.' }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ id: '1', object: 'chat.completion.chunk', created: 0, model: 'gpt-5-mini', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('');
      return new Response(sse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await streamComplete({
      settings: quirkyServerSettings,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 700,
    });

    expect(text).toBe('Halo kandidat.');
    expect(callCount).toBe(2);
  });
});
