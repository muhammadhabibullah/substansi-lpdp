'use client';

import * as React from 'react';

import {
  DEFAULT_SETTINGS,
  loadDocuments,
  loadProfile,
  loadSettings,
  migrateIfNeeded,
  saveDocuments,
  saveProfile,
  saveSettings,
  settingsAreUsable,
} from '@/lib/storage';
import { EMPTY_PROFILE, type DocumentSet, type LlmSettings, type Profile } from '@/lib/types';

/**
 * Hooks that mirror a `localStorage` slice into React state.
 *
 * They all follow the same hydration-safe pattern: render the default on the
 * server and the first client paint, load the persisted value in an effect, and
 * expose `hydrated` so screens can avoid flashing "not configured" warnings
 * before storage has been read.
 */

interface PersistedState<T> {
  value: T;
  setValue: (next: T | ((current: T) => T)) => void;
  hydrated: boolean;
}

function usePersisted<T>(
  load: () => T,
  save: (value: T) => void,
  initial: T,
): PersistedState<T> {
  const [value, setValueState] = React.useState<T>(initial);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    migrateIfNeeded();
    setValueState(load());
    setHydrated(true);
    // `load`/`save` are stable module functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setValue = React.useCallback(
    (next: T | ((current: T) => T)) => {
      setValueState((current) => {
        const resolved =
          typeof next === 'function' ? (next as (c: T) => T)(current) : next;
        save(resolved);
        return resolved;
      });
    },
    [save],
  );

  return { value, setValue, hydrated };
}

export function useSettings() {
  const { value, setValue, hydrated } = usePersisted<LlmSettings>(
    loadSettings,
    saveSettings,
    DEFAULT_SETTINGS,
  );
  return {
    settings: value,
    setSettings: setValue,
    hydrated,
    // Before hydration we cannot know; treat as configured to avoid a flash.
    configured: hydrated ? settingsAreUsable(value) : true,
  };
}

export function useProfile() {
  const { value, setValue, hydrated } = usePersisted<Profile>(
    loadProfile,
    saveProfile,
    EMPTY_PROFILE,
  );
  return { profile: value, setProfile: setValue, hydrated };
}

export function useDocuments() {
  const { value, setValue, hydrated } = usePersisted<DocumentSet>(
    loadDocuments,
    saveDocuments,
    {},
  );
  return { documents: value, setDocuments: setValue, hydrated };
}
