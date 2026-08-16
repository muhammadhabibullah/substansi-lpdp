/**
 * lib/storage.ts — typed `localStorage` access.
 *
 * The app has no database (PLAN §3): profile, documents, settings, the live
 * interview session, and the last report all live in the browser. Every read is
 * defensive because the stored JSON is user-editable and may come from an older
 * schema version.
 */

import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, type Locale } from './i18n';
import {
  EMPTY_PROFILE,
  type DocumentSet,
  type InterviewSession,
  type LlmSettings,
  type Profile,
  type Report,
} from './types';

/** Bump when a persisted shape changes incompatibly. */
export const SCHEMA_VERSION = 1;

const PREFIX = 'substansi-lpdp';

export const STORAGE_KEYS = {
  version: `${PREFIX}:schema-version`,
  settings: `${PREFIX}:llm-settings`,
  profile: `${PREFIX}:profile`,
  documents: `${PREFIX}:documents`,
  session: `${PREFIX}:session`,
  report: `${PREFIX}:report`,
  locale: LOCALE_STORAGE_KEY,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** All app keys, used by the "clear all data" control in Settings. */
export const ALL_STORAGE_KEYS: readonly string[] = Object.values(STORAGE_KEYS);

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Thrown when a write fails because the quota is exhausted. */
export class StorageFullError extends Error {
  constructor(key: string) {
    super(`localStorage quota exceeded while writing "${key}"`);
    this.name = 'StorageFullError';
  }
}

function readRaw(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    ) {
      throw new StorageFullError(key);
    }
    // Private-mode or disabled storage: degrade to in-memory only.
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeRaw(key, JSON.stringify(value));
  ensureVersionStamp();
}

export function removeKey(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function ensureVersionStamp(): void {
  if (readRaw(STORAGE_KEYS.version) === String(SCHEMA_VERSION)) return;
  writeRaw(STORAGE_KEYS.version, String(SCHEMA_VERSION));
}

/**
 * Drop persisted data written by an incompatible older schema. Settings and
 * locale are preserved because they are simple and expensive to re-enter.
 */
export function migrateIfNeeded(): void {
  if (!isBrowser()) return;
  const stored = readRaw(STORAGE_KEYS.version);
  if (stored === null) {
    ensureVersionStamp();
    return;
  }
  const version = Number.parseInt(stored, 10);
  if (Number.isFinite(version) && version < SCHEMA_VERSION) {
    removeKey(STORAGE_KEYS.documents);
    removeKey(STORAGE_KEYS.session);
    removeKey(STORAGE_KEYS.report);
    ensureVersionStamp();
  }
}

/* ── Settings ────────────────────────────────────────────────────────────── */

export const DEFAULT_SETTINGS: LlmSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-5-mini',
  cheapModel: '',
  temperature: 0.7,
  presetId: 'openai',
};

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function loadSettings(): LlmSettings {
  const raw = readJson<Partial<LlmSettings>>(STORAGE_KEYS.settings);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const temperature =
    typeof raw.temperature === 'number' &&
    Number.isFinite(raw.temperature) &&
    raw.temperature >= 0 &&
    raw.temperature <= 2
      ? raw.temperature
      : DEFAULT_SETTINGS.temperature;
  return {
    baseUrl: coerceString(raw.baseUrl, DEFAULT_SETTINGS.baseUrl),
    apiKey: coerceString(raw.apiKey, ''),
    model: coerceString(raw.model, DEFAULT_SETTINGS.model),
    cheapModel: coerceString(raw.cheapModel, ''),
    temperature,
    presetId: coerceString(raw.presetId, DEFAULT_SETTINGS.presetId),
  };
}

export function saveSettings(settings: LlmSettings): void {
  writeJson(STORAGE_KEYS.settings, settings);
}

export function clearApiKey(): void {
  const settings = loadSettings();
  saveSettings({ ...settings, apiKey: '' });
}

/** Settings are usable when there is an endpoint and a model. */
export function settingsAreUsable(settings: LlmSettings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.model.trim().length > 0;
}

/* ── Profile ─────────────────────────────────────────────────────────────── */

export function loadProfile(): Profile {
  const raw = readJson<Partial<Profile>>(STORAGE_KEYS.profile);
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PROFILE };
  return {
    ...EMPTY_PROFILE,
    ...raw,
    englishSegments:
      typeof raw.englishSegments === 'boolean'
        ? raw.englishSegments
        : raw.tujuan === 'ln',
  };
}

export function saveProfile(profile: Profile): void {
  writeJson(STORAGE_KEYS.profile, profile);
}

/* ── Documents ───────────────────────────────────────────────────────────── */

export function loadDocuments(): DocumentSet {
  return readJson<DocumentSet>(STORAGE_KEYS.documents) ?? {};
}

export function saveDocuments(docs: DocumentSet): void {
  writeJson(STORAGE_KEYS.documents, docs);
}

/* ── Interview session ───────────────────────────────────────────────────── */

export function loadSession(): InterviewSession | null {
  const session = readJson<InterviewSession>(STORAGE_KEYS.session);
  if (!session || typeof session !== 'object') return null;
  if (!Array.isArray(session.turns)) return null;
  if (!Array.isArray(session.notes)) session.notes = [];
  return session;
}

export function saveSession(session: InterviewSession): void {
  writeJson(STORAGE_KEYS.session, session);
}

export function clearSession(): void {
  removeKey(STORAGE_KEYS.session);
}

/** A session worth offering to resume. */
export function isResumable(session: InterviewSession | null): boolean {
  if (!session) return false;
  return session.status === 'running' || session.status === 'wrapping';
}

/* ── Report ──────────────────────────────────────────────────────────────── */

export function loadReport(): Report | null {
  const report = readJson<Report>(STORAGE_KEYS.report);
  if (!report || typeof report !== 'object') return null;
  if (!Array.isArray(report.dimensions)) return null;
  return report;
}

export function saveReport(report: Report): void {
  writeJson(STORAGE_KEYS.report, report);
}

export function clearReport(): void {
  removeKey(STORAGE_KEYS.report);
}

/* ── Locale ──────────────────────────────────────────────────────────────── */

export function loadLocale(): Locale {
  const raw = readRaw(STORAGE_KEYS.locale);
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export function saveLocale(locale: Locale): void {
  writeRaw(STORAGE_KEYS.locale, locale);
}

/* ── Bulk ────────────────────────────────────────────────────────────────── */

export function clearAllAppData(): void {
  for (const key of ALL_STORAGE_KEYS) removeKey(key);
}

/** Rough byte size of this app's localStorage footprint, for the Settings page. */
export function approximateUsageBytes(): number {
  if (!isBrowser()) return 0;
  let total = 0;
  for (const key of ALL_STORAGE_KEYS) {
    const raw = readRaw(key);
    if (raw) total += key.length + raw.length;
  }
  // UTF-16 code units.
  return total * 2;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
