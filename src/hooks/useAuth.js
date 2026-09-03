/**
 * useAuth
 * ---------------------------------------------------------------------------
 * The only thing components use to read or change sign-in state. Same shape
 * family as `useSettings`/`useBookmarks`, plus two responsibilities that only
 * belong here because they're tied directly to auth state changing:
 *
 *  1. POINTING `storage` AT THE RIGHT ADAPTER. Every time the signed-in user
 *     changes (including at startup), this hook calls `setActiveAdapter` —
 *     see `services/storage.js` — so `bookmarksService`/`settingsService`
 *     read and write the right place without knowing auth exists at all.
 *
 *  2. MIGRATING LOCAL DATA ON FIRST SIGN-IN. Whatever's in this browser's
 *     localStorage gets merged into the user's cloud data before the adapter
 *     swap — see `migrateLocalDataToCloud` below.
 *
 * Both only need to happen once per sign-in transition, not on every render
 * or token refresh, so `syncedUserId` guards against re-running them.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as authService from '../services/authService.js';
import { createLocalStorageAdapter, setActiveAdapter, StorageKeys } from '../services/storage.js';
import { createSupabaseAdapter } from '../services/supabaseAdapter.js';

/**
 * Merges whatever's in this browser's localStorage into `userId`'s cloud
 * data. Never deletes anything on either side, so a bug here loses nothing —
 * worst case is a stale local copy left behind.
 *
 * Settings: cloud wins if any cloud settings already exist there; otherwise
 * the local settings are uploaded once.
 *
 * Bookmarks: union by `url` — any local bookmark whose URL isn't already in
 * the cloud list gets appended; cloud wins on conflict.
 */
async function migrateLocalDataToCloud(userId) {
  const local = createLocalStorageAdapter();
  const cloud = createSupabaseAdapter(userId);

  const [localBookmarks, cloudBookmarks, localSettings, cloudSettings] = await Promise.all([
    local.read(StorageKeys.bookmarks),
    cloud.read(StorageKeys.bookmarks),
    local.read(StorageKeys.settings),
    cloud.read(StorageKeys.settings),
  ]);

  if (!cloudSettings && localSettings) {
    await cloud.write(StorageKeys.settings, localSettings);
  }

  const cloudList = Array.isArray(cloudBookmarks) ? cloudBookmarks : [];
  const localList = Array.isArray(localBookmarks) ? localBookmarks : [];
  const cloudUrls = new Set(cloudList.map((bookmark) => bookmark.url));
  const localOnly = localList.filter((bookmark) => !cloudUrls.has(bookmark.url));

  if (localOnly.length > 0) {
    await cloud.write(StorageKeys.bookmarks, [...cloudList, ...localOnly]);
  }
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // The user id `storage` is currently pointed at, so a token refresh (which
  // also fires the auth-state listener) doesn't re-migrate or re-swap.
  const syncedUserId = useRef(undefined);

  useEffect(() => {
    let isMounted = true;

    async function syncAdapter(nextUser) {
      const nextId = nextUser?.id ?? null;
      if (syncedUserId.current === nextId) return;
      syncedUserId.current = nextId;

      if (nextUser) {
        await migrateLocalDataToCloud(nextUser.id).catch((migrationError) => {
          console.warn('[useAuth] could not migrate local data to the cloud', migrationError);
        });
        setActiveAdapter(createSupabaseAdapter(nextUser.id));
      } else {
        setActiveAdapter(createLocalStorageAdapter());
      }
    }

    authService.getSession().then(async (initialUser) => {
      await syncAdapter(initialUser);
      if (isMounted) {
        setUser(initialUser);
        setIsLoading(false);
      }
    });

    const unsubscribe = authService.onAuthStateChange(async (nextUser) => {
      await syncAdapter(nextUser);
      if (isMounted) setUser(nextUser);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  /** Wraps a service call so sign-up/in/out share the same error handling:
   *  clear any previous error, run it, let failures bubble to the caller
   *  (the dialog shows them next to the form). */
  const runAuthAction = useCallback(async (action) => {
    setError(null);
    try {
      return await action();
    } catch (actionError) {
      setError(actionError);
      throw actionError;
    }
  }, []);

  const signUp = useCallback(
    (credentials) => runAuthAction(() => authService.signUp(credentials)),
    [runAuthAction],
  );

  const signIn = useCallback(
    (credentials) => runAuthAction(() => authService.signIn(credentials)),
    [runAuthAction],
  );

  const signOut = useCallback(() => runAuthAction(() => authService.signOut()), [runAuthAction]);

  return { user, isLoading, error, signUp, signIn, signOut };
}
