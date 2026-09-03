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
  // Bumped by `refresh()` to force the load effect below to re-run — see its
  // own comment for why the Settings modal's "Sync now" button needs this.
  const [refreshCount, setRefreshCount] = useState(0);

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
  }, [refreshCount]);

  /** @param {Partial<typeof settingsService.DEFAULT_SETTINGS>} changes */
  const updateSettings = useCallback(async (changes) => {
    // Update local state immediately so the UI feels instant, then persist.
    setSettings((current) => ({ ...current, ...changes }));
    await settingsService.saveSettings(changes);
  }, []);

  /** Re-reads settings from whichever adapter is active right now. The
   *  subscription above already catches changes written through this same
   *  browser, but sync is refresh-based (see `useAuth.js`) — this is what
   *  the Settings modal's "Sync now" button calls to pull down whatever
   *  changed on another device since the last load. */
  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  return { settings, isLoading, updateSettings, refresh };
}
