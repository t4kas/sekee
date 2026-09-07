/**
 * useSync
 * ---------------------------------------------------------------------------
 * Points `storage` at the right place: Supabase when signed in, localStorage
 * otherwise. That's the whole decision — bookmarks, groups and settings have
 * exactly two possible homes.
 *
 * This is the job `useAuth` used to do inline. It stays a separate hook
 * because it isn't really about authentication: it also owns the one-time
 * merge of local data into an account, and the error state from writes that
 * fail after the fact (below). `useAuth` decides who you are; this decides
 * where the data goes.
 *
 * Connecting Google Drive or Dropbox has nothing to do with this hook. Those
 * are file stores for images and attachments (see `services/files/`), not
 * destinations for structured data — an account is still what syncs your
 * bookmarks.
 *
 * WHY SUPABASE GOES THROUGH `createCachedRemoteAdapter`. Signed in, every
 * read used to be a Postgres round-trip, which a new-tab page cannot afford
 * on first paint, and every bookmark click wrote the whole bookmarks array
 * back. The wrapper serves reads from a local mirror and debounces writes, so
 * signing in stops costing you the paint. It also gives synced keys the
 * cross-device updates the Supabase adapter's no-op `subscribe` never
 * provided: a change made elsewhere lands on the next load rather than
 * waiting for a manual refresh.
 *
 * ITS ONE CONSEQUENCE: a write resolves before it reaches Postgres, so a
 * failed upload can't be reported to whoever called it. It surfaces as
 * `syncError` instead, which the Sync tab shows. Nothing is lost — the value
 * stays queued, and the queue survives a reload.
 *
 * CALL THIS ONCE, IN `App.jsx`, AND PASS THE RESULT DOWN — the same rule
 * `useAuth` documents, for the same reason. Two copies would each run their
 * own migration of the same local data.
 */

import { useEffect, useRef, useState } from 'react';
import { createLocalStorageAdapter, setActiveAdapter } from '../services/storage.js';
import { createSupabaseAdapter } from '../services/supabaseAdapter.js';
import { createCachedRemoteAdapter } from '../services/cachedRemoteAdapter.js';
import { migrateLocalDataToRemote } from '../services/syncService.js';

/** @param {object|null} user the Supabase user from `useAuth`, or null */
export function useSync(user) {
  const [syncError, setSyncError] = useState(null);

  // Set only once `storage` is actually pointed at the right adapter — see
  // the note on `accountKey` below for why this can't just be derived from
  // `user` directly.
  const [accountKey, setAccountKey] = useState(null);

  // What `storage` is currently pointed at, so a token refresh (which also
  // fires the auth listener) doesn't re-migrate or rebuild the adapter.
  const activeKey = useRef(undefined);
  // Kept only so it can be disposed on the way out — a cached adapter holds
  // pending writes and page listeners.
  const activeAdapter = useRef(null);

  useEffect(() => {
    async function apply() {
      const key = user?.id ?? 'local';
      if (activeKey.current === key) return;
      activeKey.current = key;

      await activeAdapter.current?.dispose?.().catch(() => {});
      activeAdapter.current = null;
      setSyncError(null);

      if (!user) {
        setActiveAdapter(createLocalStorageAdapter());
        setAccountKey(null);
        return;
      }

      // The raw adapter, not the wrapper: the migration needs Postgres's real
      // state, and a mirror would answer for it.
      const remote = createSupabaseAdapter(user.id);
      await migrateLocalDataToRemote(remote).catch((migrationError) => {
        console.warn('[useSync] could not migrate local data to the account', migrationError);
      });

      const adapter = createCachedRemoteAdapter(remote, {
        namespace: `supabase:${user.id}`,
        onFlushError: (flushError) => setSyncError(flushError),
      });
      activeAdapter.current = adapter;
      setActiveAdapter(adapter);
      setAccountKey(`supabase:${user.id}`);
    }

    apply();
  }, [user]);

  return {
    isSignedIn: Boolean(user),
    /** Identifies the account data flows to, or null when signed out.
     *  `useFavorites` reloads on this.
     *
     *  Deliberately NOT derived straight from `user` (i.e. NOT
     *  `user ? \`supabase:${user.id}\` : null`) — `user` flips the moment
     *  `useAuth` resolves, but pointing `storage` at the matching adapter
     *  above is async (it awaits the local->remote migration). A value
     *  computed directly from `user` would change one render before the
     *  swap actually lands, so `useFavorites` would call `getRemoteAdapter()`
     *  while it's still returning the outgoing (local) adapter, read an
     *  empty list, and never retry — which is also why a favorited
     *  background wouldn't show up on load. Setting this from inside
     *  `apply()`, after `setActiveAdapter` runs, makes sure it only changes
     *  once the adapter it names is actually live. */
    accountKey,
    syncError,
  };
}
