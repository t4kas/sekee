/**
 * Cached write-behind adapter
 * ---------------------------------------------------------------------------
 * Wraps a remote adapter (see `supabaseAdapter.js`, `dropboxAdapter.js`,
 * `googleDriveAdapter.js`) in the same four-method contract, and makes it
 * usable behind a new-tab page.
 *
 * WHY THIS EXISTS. A remote adapter on its own has two problems this app
 * can't live with:
 *
 *  1. LATENCY. A new-tab page has to paint immediately. Waiting 200-600ms on
 *     a Dropbox or Drive round-trip before the first bookmark appears is the
 *     whole feature ruined.
 *  2. WRITE VOLUME. `recordBookmarkOpened` rewrites the entire bookmarks blob
 *     on every single bookmark click. Against Postgres that's fine; against a
 *     consumer cloud API it's rate-limit bait.
 *
 * So: every read is served from a local MIRROR first and revalidated against
 * the remote in the background, and every write lands in the mirror
 * immediately and is flushed to the remote on a short debounce.
 *
 * THE TRADEOFF THIS MAKES. `write` no longer reports remote failures to its
 * caller — it has already resolved by the time the flush runs, so
 * `useBookmarks`'s `runMutation` can't surface them the way it does for a
 * direct adapter. Failures go to the `onFlushError` callback instead (the
 * Sync tab shows them), and the value stays queued and is retried. Nothing is
 * lost either way: the mirror holds the newest value, and the dirty list
 * below survives a reload.
 *
 * THE DIRTY LIST. Pending keys are recorded in the mirror itself, so a tab
 * closed inside the debounce window doesn't strand an edit — the next time
 * this adapter is built it picks those keys back up and flushes them. It also
 * guards revalidation: a key with an unflushed local edit is never overwritten
 * by a stale remote read.
 *
 * A NOTE ON SUBSCRIBE. Revalidation pushes changed values to subscribers, so
 * wrapping an adapter here also gives it something its remote has no way to
 * provide on its own: a change made on another device shows up on the next
 * load instead of waiting for a manual refresh.
 */

import { createLocalStorageAdapter, DeviceLocalKeys } from './storage.js';

/** How long to wait for more writes to the same key before flushing. Long
 *  enough to swallow a burst of bookmark clicks, short enough that a normal
 *  edit is on its way to the cloud before the user has moved on. */
const FLUSH_DEBOUNCE_MS = 2000;

/** After a failed flush, how long before trying that key again. */
const RETRY_DELAY_MS = 15000;

/** Key under which the mirror records which keys still need flushing. */
const DIRTY_KEY = '__dirty';

function isSameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * @param {object} remote an adapter matching the `storage.js` contract
 * @param {object} options
 * @param {string} options.namespace unique per provider+account, so two
 *   accounts used in the same browser can't read each other's mirror
 * @param {(error: Error, key: string) => void} [options.onFlushError]
 */
export function createCachedRemoteAdapter(remote, { namespace, onFlushError }) {
  // Namespaced so the mirror never collides with the app's own local data:
  // signing out must fall back to what this browser actually had, not to a
  // cached copy of somebody's account.
  const store = createLocalStorageAdapter();
  const mirrorKey = (key) => `mirror:${namespace}:${key}`;

  // Device-local keys (photo/weather caches) bypass all of this and use
  // their real, un-namespaced localStorage entries — they're per-device by
  // definition, so they should survive connecting and disconnecting.
  const localOnly = createLocalStorageAdapter();

  /** key -> the value waiting to be flushed. Also the "don't let
   *  revalidation clobber this" marker. */
  const pending = new Map();
  /** key -> timeout id */
  const timers = new Map();
  /** key -> Set<callback>, for revalidation pushes */
  const listeners = new Map();

  function emit(key, value) {
    for (const callback of listeners.get(key) ?? []) callback(value);
  }

  /** Mirrors `pending`'s keys into storage so a reload can resume them. */
  async function persistDirtyKeys() {
    const keys = [...pending.keys()];
    if (keys.length > 0) await store.write(mirrorKey(DIRTY_KEY), keys);
    else await store.remove(mirrorKey(DIRTY_KEY));
  }

  async function flushKey(key) {
    clearTimeout(timers.get(key));
    timers.delete(key);
    if (!pending.has(key)) return;

    const value = pending.get(key);
    try {
      await remote.write(key, value);
      // Only clear if nothing newer arrived while the write was in flight.
      if (pending.get(key) === value) {
        pending.delete(key);
        await persistDirtyKeys();
      }
    } catch (error) {
      console.warn(`[cachedRemoteAdapter] could not flush "${key}"`, error);
      onFlushError?.(error, key);
      // Stays in `pending`, so it's retried below and on the next reload.
      timers.set(key, setTimeout(() => flushKey(key), RETRY_DELAY_MS));
    }
  }

  function scheduleFlush(key) {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => flushKey(key), FLUSH_DEBOUNCE_MS));
  }

  function flushAll() {
    return Promise.all([...pending.keys()].map(flushKey));
  }

  /**
   * Reads the remote in the background and, if it disagrees with the mirror,
   * updates the mirror and tells subscribers. Skipped for any key holding an
   * unflushed local edit — that edit is newer than anything the remote can
   * still be serving.
   */
  async function revalidate(key, cachedValue) {
    if (pending.has(key)) return;
    try {
      const remoteValue = await remote.read(key);
      if (pending.has(key) || isSameValue(remoteValue, cachedValue)) return;
      await store.write(mirrorKey(key), remoteValue);
      emit(key, remoteValue);
    } catch (error) {
      console.warn(`[cachedRemoteAdapter] could not revalidate "${key}"`, error);
    }
  }

  // Resume anything a previous session left unflushed. Seeding `pending`
  // before the first read matters: it's what stops revalidation from
  // overwriting an edit that never made it to the cloud.
  const resumed = store.read(mirrorKey(DIRTY_KEY)).then(async (dirtyKeys) => {
    if (!Array.isArray(dirtyKeys)) return;
    for (const key of dirtyKeys) {
      const value = await store.read(mirrorKey(key));
      if (!pending.has(key)) pending.set(key, value);
    }
    await Promise.all(dirtyKeys.map(flushKey));
  });

  // A tab closed inside the debounce window would otherwise leave its last
  // edit for the next load to flush. `visibilitychange` fires while the page
  // is still alive and able to make requests, which `pagehide` often isn't.
  const handleHide = () => {
    if (document.visibilityState === 'hidden') flushAll();
  };
  document.addEventListener('visibilitychange', handleHide);
  window.addEventListener('pagehide', handleHide);

  return {
    isRemote: true,

    async read(key) {
      if (DeviceLocalKeys.has(key)) return localOnly.read(key);
      await resumed;

      const cached = await store.read(mirrorKey(key));

      // Nothing mirrored yet — a first load on this device. Waiting on the
      // remote here is the whole point: returning null would let
      // `bookmarksService.readAll()` seed its six starter bookmarks over an
      // account that already has real ones.
      if (cached === null) {
        const remoteValue = await remote.read(key).catch(() => null);
        if (remoteValue !== null) await store.write(mirrorKey(key), remoteValue);
        return remoteValue;
      }

      revalidate(key, cached);
      return cached;
    },

    async write(key, value) {
      if (DeviceLocalKeys.has(key)) return localOnly.write(key, value);

      await store.write(mirrorKey(key), value);
      pending.set(key, value);
      await persistDirtyKeys();
      scheduleFlush(key);
    },

    async remove(key) {
      if (DeviceLocalKeys.has(key)) return localOnly.remove(key);

      await store.remove(mirrorKey(key));
      pending.delete(key);
      clearTimeout(timers.get(key));
      timers.delete(key);
      await persistDirtyKeys();
      await remote.remove(key);
    },

    subscribe(key, callback) {
      if (DeviceLocalKeys.has(key)) return localOnly.subscribe(key, callback);

      // Two sources: this adapter's own revalidation pushes, and the
      // browser's cross-tab `storage` event on the mirror entry (so two open
      // tabs still update each other, exactly as they do when signed out).
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(callback);
      const unsubscribeFromMirror = store.subscribe(mirrorKey(key), callback);

      return () => {
        listeners.get(key)?.delete(callback);
        unsubscribeFromMirror();
      };
    },

    /** Called by `useSync` when swapping this adapter out, so a disconnect
     *  or provider switch doesn't strand pending writes or leak listeners. */
    async dispose() {
      document.removeEventListener('visibilitychange', handleHide);
      window.removeEventListener('pagehide', handleHide);
      await flushAll();
    },
  };
}

/**
 * Deletes a namespace's mirror from this device.
 *
 * Called on disconnect: the mirror is a full copy of an account's bookmarks
 * and settings, and leaving it behind on a shared browser after someone
 * unlinks their cloud account would be a small privacy leak — and a source of
 * confusing stale data if they ever reconnect.
 *
 * Reaches into `localStorage` directly rather than going through an adapter
 * because it needs to enumerate keys, which the four-method contract has no
 * way to express. This is the one place outside `storage.js` that does that.
 *
 * @param {string} namespace
 */
export function clearMirror(namespace) {
  const prefix = `sekee:mirror:${namespace}:`;
  try {
    const keys = Object.keys(window.localStorage).filter((key) => key.startsWith(prefix));
    for (const key of keys) window.localStorage.removeItem(key);
  } catch (error) {
    console.warn('[cachedRemoteAdapter] could not clear the mirror', error);
  }
}
