'use client';

import * as React from 'react';

import {
  DEFAULT_LOCALE,
  format,
  getCopy,
  type Copy,
  type Locale,
} from '@/lib/i18n';
import { loadLocale, migrateIfNeeded, saveLocale } from '@/lib/storage';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** The copy tree for the active locale. */
  c: Copy;
  /** Interpolate `{token}` placeholders. */
  f: (template: string, values?: Record<string, string | number>) => string;
  /** False until the persisted locale has been read (avoids hydration mismatch). */
  ready: boolean;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Always render the default locale on the server and first client paint, then
  // swap to the stored preference in an effect — static export has no request
  // context, so this is the only hydration-safe order.
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    migrateIfNeeded();
    setLocaleState(loadLocale());
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale;
  }, [locale, ready]);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    saveLocale(next);
  }, []);

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      c: getCopy(locale),
      f: format,
      ready,
    }),
    [locale, setLocale, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return context;
}
