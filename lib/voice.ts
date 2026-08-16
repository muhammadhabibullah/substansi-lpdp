/**
 * lib/voice.ts — voice input (speech-to-text) support for the interview.
 *
 * Typing answers inside a 60-minute interview is slow, so the composer offers
 * a voice mode built on the browser's Web Speech API (`SpeechRecognition`).
 * Constraints honored:
 * - Fully client-side: no new dependency, no server, no API key. Transcription
 *   is performed by the browser's own speech service (e.g. Google's in
 *   Chrome); the app only ever receives the resulting text — never audio.
 * - The transcript is read-only while the mic is live (recognition overwrites
 *   it); after listening stops the candidate may review and edit the text
 *   before sending (P1-6).
 * - Unsupported browsers simply fall back to typing; nothing breaks.
 */

import type { Locale } from './i18n';

/* ── Minimal structural types for the Web Speech API ─────────────────────── */
/* The SpeechRecognition API is not part of TypeScript's DOM lib and its    */
/* surface differs slightly between engines, so we type only what we use.    */

export interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/* ── Error mapping (pure, unit-tested) ───────────────────────────────────── */

/** User-facing classes of recognition failure. */
export type VoiceErrorCode = 'denied' | 'network' | 'other';

/**
 * Map a SpeechRecognition error code to a user-facing class. Returns `null`
 * for benign codes that the listening loop recovers from on its own
 * (`no-speech` just means silence; `aborted` is our own teardown).
 */
export function mapRecognitionError(code: string): VoiceErrorCode | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied';
    case 'network':
      return 'network';
    case 'no-speech':
    case 'aborted':
      return null;
    default:
      return 'other';
  }
}

/* ── Transcript helpers (pure, unit-tested) ──────────────────────────────── */

/** BCP-47 tag the recognition engine listens in, following the session. */
export function recognitionLang(locale: Locale): string {
  return locale === 'en' ? 'en-US' : 'id-ID';
}

/** Join the confirmed transcript with any pending interim words. */
export function combineTranscript(finalText: string, interimText: string): string {
  return `${finalText} ${interimText}`.replace(/\s+/g, ' ').trim();
}

/**
 * Silence between the end of one utterance and the start of the next that
 * counts as a sentence boundary. The speech engine adds no punctuation, so
 * pauses are the only boundary signal we get.
 */
export const SENTENCE_GAP_MS = 1500;

/** True when the text already ends with sentence-final punctuation. */
export function endsWithPunctuation(text: string): boolean {
  return /[.!?…]["'’”')\]]?\s*$/.test(text);
}

/** Capitalize the first letter of an utterance (id/en are Latin-script). */
export function capitalizeFirst(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.length === 0) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}

/** Ensure the submitted answer ends with sentence-final punctuation. */
export function finalizePunctuation(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0 || endsWithPunctuation(trimmed)) return trimmed;
  return `${trimmed}.`;
}

/**
 * Append a finalized chunk to the running transcript with tidy spacing.
 * When `newSentence` is set (the speaker paused between utterances), the
 * previous sentence is closed with a period and the new one capitalized —
 * standing in for the punctuation the speech engine never emits.
 */
export function appendFinalChunk(
  existing: string,
  chunk: string,
  newSentence = false,
): string {
  const cleanChunk = chunk.replace(/\s+/g, ' ').trim();
  if (existing.length === 0 || !newSentence) {
    return combineTranscript(existing, cleanChunk);
  }
  const closed = endsWithPunctuation(existing) ? existing : `${existing}.`;
  return `${closed} ${capitalizeFirst(cleanChunk)}`;
}

/* ── Engine access ───────────────────────────────────────────────────────── */

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const candidate =
    (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return typeof candidate === 'function'
    ? (candidate as SpeechRecognitionCtor)
    : null;
}

/** True when the current browser can do speech recognition. */
export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

/**
 * Create a recognition instance preconfigured for continuous interview
 * answers: keep listening across pauses and surface interim words live.
 */
export function createRecognition(lang: string): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  return recognition;
}
