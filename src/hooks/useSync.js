/**
 * useSync
 * ---------------------------------------------------------------------------
 * Decides where this browser's data goes, and points `storage` at it.
 *
 * This is the job `useAuth` used to do alongside authentication. Splitting it
 * out is what makes bring-your-own-cloud possible: signing into the app's own
 * Supabase account is now just ONE of the destinations, not the only one, and
 * `useAuth` no longer has to know that storage adapters exist.
 *
 * PRECEDENCE. An explicitly connected bring-your-own-cloud provider wins over
 * a Supabase sign-in — it's the more specific choice, and it's the one the
 * user made on this device on purpose. Otherwise a signed-in Supabase user
 * gets the Supabase adapter, and otherwise it's localStorage.
 *
 * CALL THIS ONCE, IN `App.jsx`, AND PASS THE RESULT DOWN — the same rule
 * `useAuth` documents, for the same reason. Every call runs its own
 * restore-and-migrate on connect, and two of them racing would migrate the
 * same local data twice.
 *
 * WHY BYO PROVIDERS ARE WRAPPED AND SUPABASE ISN'T. Dropbox and Drive go
 * through `createCachedRemoteAdapter` because a new-tab page can't wait on
 * their round-trip, and because they'd hit rate limits under this app's write
 * pattern. Supabase keeps talking to Postgres directly, exactly as it did
 * before this hook existed — wrapping it too is a sensible follow-up, not
 * something to change while adding providers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createLocalStorageAdapter, setActiveAdapter } from '../services/storage.js';
import { createSupabaseAdapter } from '../services/supabaseAdapter.js';
import { clearMirror, createCachedRemoteAdapter } from '../services/cachedRemoteAdapter.js';
import {
  clearConnection,
  getByoProvider,
  migrateLocalDataToRemote,
  readConnection,
  writeConnection,
} from '../services/syncService.js';

/** @param {object|null} user the Supabase user from `useAuth`, or null */
export function useSync(user) {
  const [providerId, setProviderId] = useState('local');
  const [accountLabel, setAccountLabel] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  // Set when a write-behind flush fails — see `cachedRemoteAdapter.js`. The
  // data is safe locally and will be retried; this is what lets the Sync tab
  // say so instead of the failure being invisible.
  const [syncError, setSyncError] = useState(null);

  // `provider:accountId` for whatever `storage` is currently pointed at, so a
  // token refresh (which re-runs the effect below) doesn't re-migrate or
  // rebuild the adapter.
  const activeKey = useRef(undefined);
  // The adapter we built, kept only so it can be disposed on the way out —
  // a cached adapter holds pending writes and page listeners.
  const activeAdapter = useRef(null);

  const applyDestination = useCallback(async (nextProviderId, session) => {
    const key = `${nextProviderId}:${session?.accountId ?? ''}`;
    if (activeKey.current === key) return;
    activeKey.current = key;

    await activeAdapter.current?.dispose?.().catch(() => {});
    activeAdapter.current = null;
    setSyncError(null);

    if (nextProviderId === 'local') {
      setActiveAdapter(createLocalStorageAdapter());
      setProviderId('local');
      setAccountLabel(null);
      setAccountId(null);
      return;
    }

    const provider = getByoProvider(nextProviderId);
    // The raw adapter, not the cached wrapper: the migration below needs the
    // backend's real state, and a mirror would answer for it.
    const remote =
      nextProviderId === 'supabase'
        ? createSupabaseAdapter(session.accountId)
        : provider.createAdapter(session, (renewed) => writeConnection(nextProviderId, renewed));

    await migrateLocalDataToRemote(remote).catch((migrationError) => {
      console.warn('[useSync] could not migrate local data to the remote', migrationError);
    });

    const adapter =
      nextProviderId === 'supabase'
        ? remote
        : createCachedRemoteAdapter(remote, {
            namespace: `${nextProviderId}:${session.accountId}`,
            onFlushError: (flushError) => setSyncError(flushError),
          });

    activeAdapter.current = adapter;
    setActiveAdapter(adapter);
    setProviderId(nextProviderId);
    setAccountLabel(session.accountLabel ?? null);
    setAccountId(session.accountId);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function choose() {
      const connection = await readConnection();
      const provider = connection && getByoProvider(connection.providerId);

      if (provider?.isConfigured) {
        // Silent re-auth. A failure here is usually an expired or revoked
        // token, so keep the connection record (the user linked this account
        // on purpose) and surface a reconnect prompt rather than silently
        // demoting them to local storage without saying so.
        const session = await provider.restore(connection.session).catch(() => null);
        if (session) {
          await writeConnection(provider.id, session);
          if (isMounted) await applyDestination(provider.id, session);
          return;
        }
        if (isMounted) setError(new Error(`Reconnect ${provider.label} to keep syncing.`));
      }

      if (!isMounted) return;
      if (user) {
        await applyDestination('supabase', { accountId: user.id, accountLabel: user.email });
      } else {
        await applyDestination('local', null);
      }
    }

    choose();
    return () => {
      isMounted = false;
    };
  }, [user, applyDestination]);

  /** Links a bring-your-own-cloud provider. Interactive — opens a popup. */
  const connect = useCallback(
    async (nextProviderId) => {
      const provider = getByoProvider(nextProviderId);
      if (!provider) throw new Error('That sync provider isn’t available.');

      setIsConnecting(true);
      setError(null);
      try {
        const session = await provider.connect();
        await writeConnection(nextProviderId, session);
        await applyDestination(nextProviderId, session);
        return session;
      } catch (connectError) {
        setError(connectError);
        throw connectError;
      } finally {
        setIsConnecting(false);
      }
    },
    [applyDestination],
  );

  /** Unlinks the connected provider and falls back to Supabase if the user is
   *  signed in, or to this device otherwise. */
  const disconnect = useCallback(async () => {
    setError(null);
    const connection = await readConnection();
    const provider = connection && getByoProvider(connection.providerId);

    if (provider) {
      await provider.disconnect(connection.session).catch((disconnectError) => {
        // Revoking the token is best-effort: if it fails we still want the
        // local link gone, otherwise the user can't get out of a broken state.
        console.warn('[useSync] could not revoke the provider token', disconnectError);
      });
      clearMirror(`${connection.providerId}:${connection.session?.accountId ?? ''}`);
    }

    await clearConnection();
    if (user) {
      await applyDestination('supabase', { accountId: user.id, accountLabel: user.email });
    } else {
      await applyDestination('local', null);
    }
  }, [user, applyDestination]);

  return {
    /** 'local' | 'supabase' | a BYO provider id */
    providerId,
    /** Email or account name to show next to the provider, if we know one. */
    accountLabel,
    /** Identifies the account data is flowing to, or null when device-only.
     *  `useFavorites` reloads on this. */
    accountKey: providerId === 'local' ? null : `${providerId}:${accountId}`,
    isConnecting,
    error,
    syncError,
    connect,
    disconnect,
  };
}
