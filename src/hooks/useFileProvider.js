/**
 * useFileProvider
 * ---------------------------------------------------------------------------
 * Links and unlinks the user's own cloud storage, and registers the resulting
 * store with `fileStorageService` so services can reach it without knowing
 * React exists — the same shape as `useSync` pointing `storage` at an adapter.
 *
 * THIS IS NOT ABOUT SYNC. Linking Dropbox here gives the app somewhere to put
 * files; it does not move bookmarks, groups or settings, which sync to your
 * account or stay on this device (see `useSync.js`). The two are kept apart on
 * purpose, in the code and in the Settings tabs.
 *
 * CALL THIS ONCE, IN `App.jsx`, AND PASS THE RESULT DOWN. Two copies would
 * each restore their own session on boot and each register a store, and the
 * loser's refreshed tokens would be silently discarded.
 *
 * A FAILED RESTORE IS NOT A DISCONNECT. An expired or revoked token leaves
 * the connection record in place and reports `error` instead, so the user is
 * asked to reconnect rather than quietly finding their storage unlinked — the
 * link was deliberate, and only they should undo it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearFileConnection,
  getAvailableFileProviders,
  getFileProvider,
  readFileConnection,
  writeFileConnection,
} from '../services/files/fileProviders.js';
import { setPersonalStore } from '../services/fileStorageService.js';

export function useFileProvider() {
  const [providerId, setProviderId] = useState(null);
  const [accountLabel, setAccountLabel] = useState(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // What's registered right now, so a token refresh doesn't rebuild the store.
  const activeKey = useRef(undefined);

  const applyProvider = useCallback((provider, session) => {
    const key = `${provider.id}:${session.accountId}`;
    if (activeKey.current === key) return;
    activeKey.current = key;

    setPersonalStore(
      provider.createStore(session, (renewed) => writeFileConnection(provider.id, renewed)),
    );
    setProviderId(provider.id);
    setAccountLabel(session.accountLabel ?? null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function restore() {
      const connection = await readFileConnection();
      const provider = connection && getFileProvider(connection.providerId);

      if (!provider?.isConfigured) {
        if (isMounted) setIsRestoring(false);
        return;
      }

      const session = await provider.restore(connection.session).catch(() => null);
      if (!isMounted) return;

      if (session) {
        await writeFileConnection(provider.id, session);
        applyProvider(provider, session);
      } else {
        setError(new Error(`Reconnect ${provider.label} to use your files.`));
      }
      setIsRestoring(false);
    }

    restore();
    return () => {
      isMounted = false;
    };
  }, [applyProvider]);

  /** Interactive — opens a consent popup. */
  const connect = useCallback(
    async (nextProviderId) => {
      const provider = getFileProvider(nextProviderId);
      if (!provider?.isConfigured) throw new Error('That storage provider isn’t available.');

      setIsConnecting(true);
      setError(null);
      try {
        const session = await provider.connect();
        await writeFileConnection(nextProviderId, session);
        // A different account on the same provider still has to replace the
        // registered store, and the key guard alone wouldn't catch that.
        activeKey.current = undefined;
        applyProvider(provider, session);
        return session;
      } catch (connectError) {
        setError(connectError);
        throw connectError;
      } finally {
        setIsConnecting(false);
      }
    },
    [applyProvider],
  );

  const disconnect = useCallback(async () => {
    setError(null);
    const connection = await readFileConnection();
    const provider = connection && getFileProvider(connection.providerId);

    // Revoking the token is best-effort: if it fails we still want the local
    // link gone, or the user can't get out of a broken state.
    await provider?.disconnect(connection.session).catch((disconnectError) => {
      console.warn('[useFileProvider] could not revoke the provider token', disconnectError);
    });

    await clearFileConnection();
    activeKey.current = undefined;
    setPersonalStore(null);
    setProviderId(null);
    setAccountLabel(null);
  }, []);

  return {
    /** The linked provider's id, or null. */
    providerId,
    accountLabel,
    isConnected: Boolean(providerId),
    isRestoring,
    isConnecting,
    error,
    /** Only the providers this build has keys for. */
    available: getAvailableFileProviders(),
    connect,
    disconnect,
  };
}
