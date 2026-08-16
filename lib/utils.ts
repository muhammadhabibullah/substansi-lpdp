import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui class merge helper. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Stable-enough id for transcript turns and reports (no crypto dependency). */
export function createId(prefix = 'id'): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

/** `mm:ss` for the interview countdown. */
export function formatClock(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Human duration such as "42 menit" / "1 jam 3 menit". */
export function formatDuration(ms: number, locale: 'id' | 'en' = 'id'): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourWord = locale === 'id' ? 'jam' : 'h';
  const minuteWord = locale === 'id' ? 'menit' : 'min';
  if (hours === 0) return `${minutes} ${minuteWord}`;
  if (minutes === 0) return `${hours} ${hourWord}`;
  return `${hours} ${hourWord} ${minutes} ${minuteWord}`;
}

export function formatNumber(value: number, locale: 'id' | 'en' = 'id'): string {
  return new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US').format(value);
}

export function formatDateTime(ts: number, locale: 'id' | 'en' = 'id'): string {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(ts));
}

/** Clamp a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Collapse runs of whitespace — used when normalizing parsed document text. */
export function collapseWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Count whitespace-separated words in a text. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * True when the endpoint runs on the user's own machine (Ollama, LM Studio),
 * where OpenAI-compatible servers usually accept requests without a key.
 */
export function isLocalBaseUrl(raw: string): boolean {
  try {
    const host = new URL(raw.trim()).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return (
      host === 'localhost' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.startsWith('127.')
    );
  } catch {
    return false;
  }
}
