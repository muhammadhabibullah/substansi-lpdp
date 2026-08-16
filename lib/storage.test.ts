import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteReport,
  loadReport,
  loadReports,
  MAX_REPORT_HISTORY,
  settingsAreUsable,
  STORAGE_KEYS,
  upsertReport,
} from './storage';
import { EMPTY_PROFILE, type Report } from './types';

/**
 * The vitest environment is `node`, so provide a minimal in-memory
 * `window.localStorage` for the browser-guarded storage helpers.
 */
class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    localStorage: new MemoryStorage(),
  };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

function makeReport(id: string, createdAt: number): Report {
  return {
    id,
    sessionId: `${id}-session`,
    createdAt,
    locale: 'id',
    profile: { ...EMPTY_PROFILE },
    model: 'test-model',
    durationMs: 60_000,
    phasesCovered: ['opening'],
    answerCount: 1,
    totalScore: 50,
    band: 'dipertimbangkan',
    dimensions: [],
    panelNotes: [],
    strongSignals: [],
    weakSignals: [],
    nextSteps: [],
    turns: [],
  };
}

describe('settingsAreUsable', () => {
  const base = {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-5-mini',
    cheapModel: '',
    temperature: 0.7,
    presetId: 'openai',
  };

  it('rejects a remote endpoint without an API key', () => {
    expect(settingsAreUsable({ ...base, apiKey: '' })).toBe(false);
    expect(settingsAreUsable({ ...base, apiKey: '   ' })).toBe(false);
  });

  it('accepts a remote endpoint with an API key', () => {
    expect(settingsAreUsable({ ...base, apiKey: 'sk-test' })).toBe(true);
  });

  it('accepts local endpoints without a key', () => {
    expect(
      settingsAreUsable({ ...base, apiKey: '', baseUrl: 'http://localhost:11434/v1' }),
    ).toBe(true);
    expect(
      settingsAreUsable({ ...base, apiKey: '', baseUrl: 'http://127.0.0.1:1234/v1' }),
    ).toBe(true);
  });

  it('still requires a base URL and a model', () => {
    expect(settingsAreUsable({ ...base, apiKey: 'sk', baseUrl: '' })).toBe(false);
    expect(settingsAreUsable({ ...base, apiKey: 'sk', model: '  ' })).toBe(false);
  });
});

describe('report history storage', () => {
  it('starts empty', () => {
    expect(loadReports()).toEqual([]);
    expect(loadReport()).toBeNull();
  });

  it('keeps newest reports first', () => {
    upsertReport(makeReport('older', 1000));
    upsertReport(makeReport('newer', 2000));
    expect(loadReports().map((report) => report.id)).toEqual(['newer', 'older']);
    expect(loadReport()?.id).toBe('newer');
  });

  it('replaces the entry of the same session (regenerate)', () => {
    upsertReport(makeReport('first', 1000));
    const redo = { ...makeReport('second', 2000), sessionId: 'first-session' };
    upsertReport(redo);

    const list = loadReports();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('second');
  });

  it('caps the history at MAX_REPORT_HISTORY entries', () => {
    for (let index = 0; index < MAX_REPORT_HISTORY + 5; index += 1) {
      upsertReport(makeReport(`report-${index}`, index));
    }
    const list = loadReports();
    expect(list).toHaveLength(MAX_REPORT_HISTORY);
    expect(list[0]?.id).toBe(`report-${MAX_REPORT_HISTORY + 4}`);
    expect(list.map((report) => report.id)).not.toContain('report-0');
  });

  it('deletes a single report by id', () => {
    upsertReport(makeReport('keep', 1000));
    upsertReport(makeReport('drop', 2000));
    deleteReport('drop');
    expect(loadReports().map((report) => report.id)).toEqual(['keep']);
  });

  it('migrates the legacy single-report key into the history', () => {
    const legacy = makeReport('legacy', 1500);
    window.localStorage.setItem(STORAGE_KEYS.report, JSON.stringify(legacy));

    const list = loadReports();
    expect(list.map((report) => report.id)).toEqual(['legacy']);
    expect(window.localStorage.getItem(STORAGE_KEYS.report)).toBeNull();

    // Migration persists: the report now lives under the list key.
    upsertReport(makeReport('newer', 2000));
    expect(loadReports().map((report) => report.id)).toEqual(['newer', 'legacy']);
  });

  it('keeps the list order when the legacy report is newer', () => {
    upsertReport(makeReport('old-list-entry', 1000));
    const legacy = makeReport('legacy', 3000);
    window.localStorage.setItem(STORAGE_KEYS.report, JSON.stringify(legacy));

    expect(loadReports().map((report) => report.id)).toEqual([
      'legacy',
      'old-list-entry',
    ]);
  });

  it('ignores malformed entries in the stored list', () => {
    window.localStorage.setItem(
      STORAGE_KEYS.reports,
      JSON.stringify([makeReport('valid', 1000), { nonsense: true }, 'junk']),
    );
    expect(loadReports().map((report) => report.id)).toEqual(['valid']);
  });
});
