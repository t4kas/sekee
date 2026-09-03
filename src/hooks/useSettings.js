/**
 * useSettings
 * ---------------------------------------------------------------------------
 * Reads and writes the user's preferences (search engine, background
 * category). Same shape as `useBookmarks`.
 *
 * `settings` starts at the defaults rather than null, so components can read
 * `settings.engineId` on the very first render without null-checking.
 */

import { useCallback, useEffect, useState } from 'react';
import * as settingsService from '../services/settingsService.js';

export function useSettings() {
  const [settings, setSettings] = useState(settingsService.DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    settingsService.loadSettings().then((loaded) => {
      if (isMounted) {
        setSettings(loaded);
        setIsLoading(false);
      }
    });

    const unsubscribe = settingsService.subscribeToSettings((updated) => {
      if (isMounted) setSettings(updated);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  /** @param {Partial<typeof settingsService.DEFAULT_SETTINGS>} changes */
  const updateSettings = useCallback(async (changes) => {
    // Update local state immediately so the UI feels instant, then persist.
    setSettings((current) => ({ ...current, ...changes }));
    await settingsService.saveSettings(changes);
  }, []);

  return { settings, isLoading, updateSettings };
}
