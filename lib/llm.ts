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
 * A `fetch` wrapper that strips the Authorization header if the request ever
 * targets an origin other than the configured base URL (e.g. after a redirect).
 */
function guardedFetch(baseUrl: string): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!isSameOriginAsBase(url, baseUrl)) {
      const headers = new Headers(init?.headers);
      headers.delete('Authorization');
      headers.delete('api-key');
      return fetch(input, { ...init, headers, redirect: 'error' });
    }
    // Never auto-follow a cross-origin redirect while credentials are attached.
    return fetch(input, { ...init, redirect: 'error' });
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
}

/**
 * Streaming completion used by the panelists. Resolves with the full text once
 * the stream ends; `onDelta` receives incremental chunks for live rendering.
 */
export async function streamComplete(options: StreamOptions): Promise<string> {
  const resolved = assertConfigured(options.settings);
  const provider = createProvider(resolved);
  const modelId = pickModel(resolved, options.tier ?? 'main');

  try {
    const result = streamText({
      model: provider(modelId),
      messages: options.messages,
      temperature: options.temperature ?? resolved.temperature,
      maxTokens: options.maxTokens,
      abortSignal: options.signal,
      maxRetries: 1,
    });

    let text = '';
    for await (const delta of result.textStream) {
      text += delta;
      options.onDelta?.(delta);
    }

    // A stream that ends with nothing is a failure, not an empty answer.
    if (text.trim().length === 0) {
      const finish = await result.finishReason.catch(() => 'unknown');
      throw new LlmError(
        'bad-response',
        `Stream produced no text (finishReason: ${String(finish)})`,
      );
    }
    return text.trim();
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
