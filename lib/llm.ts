/**
 * lib/llm.ts — the single gateway to the LLM (AGENTS.md: components never fetch
 * an LLM endpoint directly).
 *
 * Uses the Vercel AI SDK's OpenAI-compatible provider straight from the browser
 * against a user-configured base URL (PLAN §3). Key-safety rules enforced here:
 *
 *  1. The API key is attached only to requests whose origin matches the
 *     user-configured base URL — verified per request in `guardedFetch`, so a
 *     redirect to another host can never carry the key.
 *  2. No telemetry, no logging of prompt or response contents.
 *  3. Nothing is cached anywhere outside the caller's own state.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, type CoreMessage } from 'ai';

import type { LlmSettings } from './types';

export type { CoreMessage };

/* ── Provider presets (M6-3) ─────────────────────────────────────────────── */

export interface ProviderPreset {
  id: string;
  /** i18n key under `presets`. */
  labelKey: 'openai' | 'openrouter' | 'groq' | 'ollama' | 'lmstudio';
  baseUrl: string;
  suggestedModel: string;
  suggestedCheapModel: string;
  /** Local endpoints usually accept any key, including none. */
  keyRequired: boolean;
  docsUrl: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'openai',
    labelKey: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    suggestedModel: 'gpt-5-mini',
    suggestedCheapModel: 'gpt-5-mini',
    keyRequired: true,
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'openrouter',
    labelKey: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    suggestedModel: 'openai/gpt-5-mini',
    suggestedCheapModel: 'openai/gpt-5-mini',
    keyRequired: true,
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'groq',
    labelKey: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    suggestedModel: 'llama-3.3-70b-versatile',
    suggestedCheapModel: 'llama-3.1-8b-instant',
    keyRequired: true,
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'ollama',
    labelKey: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    suggestedModel: 'llama3.1:8b',
    suggestedCheapModel: 'llama3.1:8b',
    keyRequired: false,
    docsUrl: 'https://ollama.com/download',
  },
  {
    id: 'lmstudio',
    labelKey: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    suggestedModel: 'local-model',
    suggestedCheapModel: 'local-model',
    keyRequired: false,
    docsUrl: 'https://lmstudio.ai/',
  },
] as const;

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

/* ── Errors ──────────────────────────────────────────────────────────────── */

export type LlmErrorKind =
  | 'not-configured'
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'aborted'
  | 'bad-response'
  | 'unknown';

/** Normalized failure so the UI can map to i18n copy instead of raw messages. */
export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status?: number;

  constructor(kind: LlmErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
  }

  /** Whether retrying the identical request could plausibly succeed. */
  get retryable(): boolean {
    return this.kind === 'rate-limit' || this.kind === 'network';
  }
}

function statusToKind(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (status >= 500) return 'network';
  return 'bad-response';
}

/** Map anything thrown by the SDK/fetch onto an `LlmError`. */
export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new LlmError('aborted', 'Request aborted');
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new LlmError('aborted', error.message);
  }

  // AI SDK errors carry a `statusCode`; fetch/CORS failures are TypeErrors.
  const candidate = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  const status =
    typeof candidate?.statusCode === 'number'
      ? candidate.statusCode
      : typeof candidate?.status === 'number'
        ? candidate.status
        : undefined;

  const message =
    typeof candidate?.message === 'string' && candidate.message.length > 0
      ? candidate.message
      : 'LLM request failed';

  if (status !== undefined) {
    return new LlmError(statusToKind(status), message, status);
  }
  if (error instanceof TypeError) {
    return new LlmError('network', message);
  }
  return new LlmError('unknown', message);
}

/* ── Base URL handling ───────────────────────────────────────────────────── */

/** Normalize a user-entered base URL: trim, strip trailing slashes. */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function parseBaseUrl(raw: string): URL | null {
  const normalized = normalizeBaseUrl(raw);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Key-safety rule #1: only attach credentials when the request target is on the
 * same origin as the configured base URL.
 */
export function isSameOriginAsBase(requestUrl: string, baseUrl: string): boolean {
  const base = parseBaseUrl(baseUrl);
  if (!base) return false;
  try {
    return new URL(requestUrl, base).origin === base.origin;
  } catch {
    return false;
  }
}

/* ── Client construction ─────────────────────────────────────────────────── */

export interface ResolvedSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  cheapModel: string;
  temperature: number;
}

export function resolveSettings(settings: LlmSettings): ResolvedSettings {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const model = settings.model.trim();
  return {
    baseUrl,
    apiKey: settings.apiKey.trim(),
    model,
    cheapModel: settings.cheapModel.trim() || model,
    temperature: settings.temperature,
  };
}

export function assertConfigured(settings: LlmSettings): ResolvedSettings {
  const resolved = resolveSettings(settings);
  if (!parseBaseUrl(resolved.baseUrl)) {
    throw new LlmError('not-configured', 'Base URL is missing or invalid');
  }
  if (!resolved.model) {
    throw new LlmError('not-configured', 'Model is not set');
  }
  return resolved;
}

/**
 * Newer OpenAI models (the `gpt-5*`, `o1*`, `o3*`, `o4*` reasoning families)
 * reject several classic chat-completions parameters that older models and
 * every other OpenAI-compatible provider accept fine. Two layers defend
 * against this:
 *
 *  1. **Proactive** — `sanitizeBodyForModel` rewrites the request body before
 *     the very first attempt whenever the body's `model` belongs to a family
 *     known to reject these parameters. No wasted round-trip, and it works
 *     even when a gateway reports rejections inside a 200 SSE stream.
 *  2. **Reactive** — an unrecognized model that still rejects a parameter
 *     gets one retry per quirk: `guardedFetch` recognizes the specific error
 *     the endpoint returns and patches the request body accordingly.
 *
 * Providers that never hit these errors (Groq, OpenRouter, Ollama, LM Studio)
 * are unaffected and pay no extra request.
 */
interface RequestQuirkFix {
  /** Human-readable id, used only in test output. */
  id: string;
  /** Matches the error message the endpoint returns for this incompatibility. */
  matches: (message: string) => boolean;
  /** Returns a patched JSON body, or null if this quirk does not apply here. */
  patch: (body: string) => string | null;
}

/**
 * Model families that reject the classic parameters: `gpt-5*` and the `o1/o3/
 * o4` reasoning series. Tolerates provider prefixes (`openai/gpt-5-mini`,
 * `openrouter/openai/o3`) and date suffixes (`o3-2025-04-16`), and never
 * matches unrelated ids (`gpt-5000`, `koala-13b`, `o15`).
 */
const REASONING_MODEL_PATTERN = /(?:^|[/.])(?:gpt-5|o1|o3|o4)(?:[.-]|$)/i;

/** Exported for unit testing. */
export function isReasoningOnlyModel(modelId: string): boolean {
  return REASONING_MODEL_PATTERN.test(modelId.trim());
}

/**
 * `max_tokens` is rejected; the model wants `max_completion_tokens` with the
 * same value instead.
 */
const maxTokensQuirk: RequestQuirkFix = {
  id: 'max_tokens -> max_completion_tokens',
  matches: (message) =>
    /unsupported parameter.{0,40}'max_tokens'.{0,80}max_completion_tokens/i.test(message),
  patch: (body) => renameJsonField(body, 'max_tokens', 'max_completion_tokens'),
};

/**
 * A non-default `temperature` is rejected; the model only accepts the
 * implicit default, so the field must be dropped rather than renamed.
 */
const temperatureQuirk: RequestQuirkFix = {
  id: 'drop unsupported temperature',
  matches: (message) =>
    /unsupported value.{0,20}'temperature'.{0,120}only the default.{0,20}value is supported/i.test(
      message,
    ),
  patch: (body) => dropJsonField(body, 'temperature'),
};

/** Checked in order against each failed response body. */
const REQUEST_QUIRK_FIXES: readonly RequestQuirkFix[] = [maxTokensQuirk, temperatureQuirk];

/**
 * Layer 1 (proactive): rewrite the request body for model families known to
 * reject classic parameters, so their very first attempt is already valid.
 * The model id is read from the body itself so cheap/main tiers are each
 * sanitized by their own id. Returns the patched JSON, or null when the
 * model is not affected, nothing needed patching, or the body is not JSON.
 */
function sanitizeBodyForModel(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.model !== 'string' || !isReasoningOnlyModel(parsed.model)) {
      return null;
    }
    let changed = false;
    if ('max_tokens' in parsed) {
      parsed.max_completion_tokens = parsed.max_tokens;
      delete parsed.max_tokens;
      changed = true;
    }
    if ('temperature' in parsed) {
      delete parsed.temperature;
      changed = true;
    }
    return changed ? JSON.stringify(parsed) : null;
  } catch {
    return null;
  }
}

/** Exported for unit testing; also used internally by `guardedFetch`. */
export function sanitizeReasoningModelBody(body: string): string | null {
  return sanitizeBodyForModel(body);
}

/** Exported for unit testing. */
export function isMaxTokensUnsupportedError(message: string): boolean {
  return maxTokensQuirk.matches(message);
}

/** Exported for unit testing. */
export function isTemperatureUnsupportedError(message: string): boolean {
  return temperatureQuirk.matches(message);
}

/**
 * Rename a JSON body's field, preserving its value and every other field.
 * Returns null when the field is absent or the body is not valid JSON.
 */
function renameJsonField(body: string, from: string, to: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!(from in parsed)) return null;
    const { [from]: value, ...rest } = parsed;
    return JSON.stringify({ ...rest, [to]: value });
  } catch {
    return null;
  }
}

/** Exported for unit testing; also used internally by `guardedFetch`. */
export function renameMaxTokensField(body: string): string | null {
  return renameJsonField(body, 'max_tokens', 'max_completion_tokens');
}

/** Remove a JSON body's field entirely. Returns null when it is already absent. */
function dropJsonField(body: string, field: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!(field in parsed)) return null;
    const { [field]: _dropped, ...rest } = parsed;
    return JSON.stringify(rest);
  } catch {
    return null;
  }
}

/** Exported for unit testing; also used internally by `guardedFetch`. */
export function dropTemperatureField(body: string): string | null {
  return dropJsonField(body, 'temperature');
}

/** How many self-healing retries a single request may go through. */
const MAX_QUIRK_RETRIES = REQUEST_QUIRK_FIXES.length;

/**
 * How long a single request may wait for the endpoint to *start* responding.
 * Generous on purpose: reasoning models think before they stream, and it is
 * better to wait two minutes and then surface the normal recovery UI ("Coba
 * lagi") than to fail a slow-but-working endpoint early. The timer clears as
 * soon as response headers arrive, so long streams are never cut short.
 * Exported for unit testing.
 */
export const RESPONSE_TIMEOUT_MS = 120_000;

/**
 * `fetch` with a wait-for-response timeout. A timeout is reported as a
 * retryable network failure (so the recovery UI with "Coba lagi" appears),
 * while a caller-initiated abort keeps propagating as an `AbortError` so
 * intentional cancels stay silent.
 */
async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const callerSignal = init?.signal ?? undefined;
  const forwardAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', forwardAbort);
  if (callerSignal?.aborted) controller.abort();

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      // A TypeError maps onto `LlmError.kind === 'network'` (retryable).
      throw new TypeError(`LLM request timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * A `fetch` wrapper that strips the Authorization header if the request ever
 * targets an origin other than the configured base URL (e.g. after a redirect),
 * proactively sanitizes the body for known-picky model families, and
 * transparently retries with a patched body when the endpoint rejects a
 * parameter per `REQUEST_QUIRK_FIXES`. Exported for unit testing.
 */
export function guardedFetch(baseUrl: string): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const crossOrigin = !isSameOriginAsBase(url, baseUrl);
    const headers = new Headers(init?.headers);
    if (crossOrigin) {
      headers.delete('Authorization');
      headers.delete('api-key');
    }
    // Never auto-follow a cross-origin redirect while credentials are attached.
    const requestInit: RequestInit = { ...init, headers, redirect: 'error' };

    // Layer 1: make the first attempt already valid for known-picky models.
    let body = init?.body;
    if (typeof body === 'string') {
      body = sanitizeBodyForModel(body) ?? body;
    }

    let response = await fetchWithTimeout(input, { ...requestInit, body }, RESPONSE_TIMEOUT_MS);

    // Layer 2: heal unrecognized models from their own error message.
    for (let attempt = 0; attempt < MAX_QUIRK_RETRIES; attempt += 1) {
      if (response.ok || typeof body !== 'string') return response;

      // Peek at the error body without consuming the caller's response stream.
      const probe = response.clone();
      let message = '';
      try {
        message = await probe.text();
      } catch {
        return response;
      }

      const quirk = REQUEST_QUIRK_FIXES.find((candidate) => candidate.matches(message));
      if (!quirk) return response;

      const patched = quirk.patch(body);
      if (!patched) return response;

      body = patched;
      response = await fetchWithTimeout(input, { ...requestInit, body }, RESPONSE_TIMEOUT_MS);
    }

    return response;
  };
}

type CompatibleProvider = ReturnType<typeof createOpenAICompatible>;

function createProvider(resolved: ResolvedSettings): CompatibleProvider {
  return createOpenAICompatible({
    name: 'byok',
    baseURL: resolved.baseUrl,
    // Empty string for local endpoints that need no credential.
    apiKey: resolved.apiKey || undefined,
    fetch: guardedFetch(resolved.baseUrl),
  });
}

/** Which of the two configured models a call should use. */
export type ModelTier = 'main' | 'cheap';

function pickModel(resolved: ResolvedSettings, tier: ModelTier): string {
  return tier === 'cheap' ? resolved.cheapModel : resolved.model;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

export interface CompleteOptions {
  settings: LlmSettings;
  messages: CoreMessage[];
  tier?: ModelTier;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** One-shot, non-streaming completion. Used by moderator, note-taker, grading. */
export async function complete(options: CompleteOptions): Promise<string> {
  const resolved = assertConfigured(options.settings);
  const provider = createProvider(resolved);
  const modelId = pickModel(resolved, options.tier ?? 'main');

  try {
    const result = await generateText({
      model: provider(modelId),
      messages: options.messages,
      temperature: options.temperature ?? resolved.temperature,
      maxTokens: options.maxTokens,
      abortSignal: options.signal,
      maxRetries: 1,
    });
    return result.text.trim();
  } catch (error) {
    throw toLlmError(error);
  }
}

export interface StreamOptions extends CompleteOptions {
  /** Called with each incremental text delta. */
  onDelta?: (delta: string) => void;
  /**
   * Called when a stream was cut off by the token limit and is about to be
   * retried with a larger budget. Callers rendering `onDelta` live must reset
   * their buffered text first, because the retry regenerates the turn from
   * scratch.
   */
  onTruncationRetry?: () => void;
}

/**
 * Upper bound for the post-truncation retry budget. Reasoning models (gpt-5*,
 * o1/o3/o4) count internal thinking against the shared `max_completion_tokens`
 * budget, so visible output can be cut off mid-sentence even when the caller's
 * budget looks generous. Doubling the budget fixes that; the cap only guards
 * against unreasonable requests. Exported for unit testing.
 */
export const TRUNCATION_RETRY_MAX_TOKENS = 4000;

/** Exported for unit testing. */
export function truncatedRetryBudget(maxTokens: number): number {
  return Math.min(maxTokens * 2, TRUNCATION_RETRY_MAX_TOKENS);
}

/**
 * Streaming completion used by the panelists. Resolves with the full text once
 * the stream ends; `onDelta` receives incremental chunks for live rendering.
 *
 * A stream that ends with `finishReason: 'length'` hit the token cap and would
 * render as a half-finished question, so it is retried once with a doubled
 * budget. If that is still truncated, a `bad-response` error surfaces the
 * normal recovery UI ("Coba lagi") instead of committing a cut-off turn.
 */
export async function streamComplete(options: StreamOptions): Promise<string> {
  const resolved = assertConfigured(options.settings);
  const provider = createProvider(resolved);
  const modelId = pickModel(resolved, options.tier ?? 'main');

  const runOnce = async (maxTokens: number | undefined) => {
    const result = streamText({
      model: provider(modelId),
      messages: options.messages,
      temperature: options.temperature ?? resolved.temperature,
      maxTokens,
      abortSignal: options.signal,
      maxRetries: 1,
    });

    let text = '';
    for await (const delta of result.textStream) {
      text += delta;
      options.onDelta?.(delta);
    }
    const finishReason = await result.finishReason.catch(() => 'unknown');
    return { text: text.trim(), finishReason };
  };

  try {
    let { text, finishReason } = await runOnce(options.maxTokens);

    if (finishReason === 'length' && options.maxTokens !== undefined) {
      options.onTruncationRetry?.();
      ({ text, finishReason } = await runOnce(truncatedRetryBudget(options.maxTokens)));
    }

    // A stream that ends with nothing is a failure, not an empty answer.
    if (text.length === 0) {
      throw new LlmError(
        'bad-response',
        `Stream produced no text (finishReason: ${finishReason})`,
      );
    }
    if (finishReason === 'length') {
      throw new LlmError('bad-response', 'Stream was cut off by the token limit');
    }
    return text;
  } catch (error) {
    throw toLlmError(error);
  }
}

/**
 * Ask for JSON and parse it, tolerating the fenced-code-block wrapping that
 * many models add. Retries once with a stricter instruction before giving up.
 */
export async function completeJson<T>(
  options: CompleteOptions & { validate: (value: unknown) => T },
): Promise<T> {
  const attempt = async (extraNudge: boolean): Promise<T> => {
    const messages: CoreMessage[] = extraNudge
      ? [
          ...options.messages,
          {
            role: 'system',
            content:
              'Your previous output was not valid JSON. Reply with raw JSON only: no prose, no markdown fences.',
          },
        ]
      : options.messages;

    const raw = await complete({ ...options, messages });
    const parsed = extractJson(raw);
    if (parsed === undefined) {
      throw new LlmError('bad-response', 'Response contained no JSON object');
    }
    return options.validate(parsed);
  };

  try {
    return await attempt(false);
  } catch (error) {
    const llmError = toLlmError(error);
    // Only a malformed payload is worth a second, stricter attempt.
    if (llmError.kind !== 'bad-response') throw llmError;
    return attempt(true);
  }
}

/**
 * Pull the first JSON object/array out of a model response, stripping markdown
 * fences and surrounding prose.
 */
export function extractJson(raw: string): unknown {
  const text = raw.trim();
  if (!text) return undefined;

  const candidates: string[] = [];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(text);

  const firstBrace = text.search(/[[{]/);
  if (firstBrace >= 0) {
    const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (lastBrace > firstBrace) {
      candidates.push(text.slice(firstBrace, lastBrace + 1));
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return undefined;
}

/* ── Connection test (M1-4) ──────────────────────────────────────────────── */

export interface ConnectionTestResult {
  ok: boolean;
  reply?: string;
  error?: LlmError;
}

/**
 * Minimal round-trip used by the Settings "test connection" button: proves the
 * endpoint, key, and model all work together without burning real tokens.
 */
export async function testConnection(
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<ConnectionTestResult> {
  try {
    const reply = await complete({
      settings,
      messages: [
        {
          role: 'system',
          content: 'Reply with exactly one word: OK',
        },
        { role: 'user', content: 'Connection test.' },
      ],
      maxTokens: 16,
      temperature: 0,
      signal,
    });
    return { ok: true, reply: reply.slice(0, 80) };
  } catch (error) {
    return { ok: false, error: toLlmError(error) };
  }
}
