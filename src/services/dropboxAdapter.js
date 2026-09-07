/**
 * Dropbox storage adapter
 * ---------------------------------------------------------------------------
 * Same four-method contract as `supabaseAdapter.js`, backed by one JSON file
 * per key in the user's own Dropbox App folder.
 *
 * FILE SHAPE: `/sekee-bookmarks.json`, `/sekee-settings.json` and so on —
 * paths relative to `Apps/<app name>/`, which is all this app's token can
 * reach. One file per key rather than one combined document, so a bookmark
 * edit and a settings change can never overwrite each other, and so the
 * mapping to the adapter contract stays exactly one-to-one.
 *
 * WRAP THIS IN `createCachedRemoteAdapter`. `useSync` does, and it isn't
 * optional: `read` here is a network round-trip, which a new-tab page can't
 * wait on, and this app rewrites the whole bookmarks blob on every bookmark
 * click, which would run into Dropbox's rate limits within a session. The
 * wrapper is what turns that into an instant local read and one debounced
 * upload. This file stays a plain, honest adapter.
 *
 * ERROR HANDLING follows the Supabase adapter: `read`/`remove` warn and
 * degrade, `write` throws so the caller (here, the cache's flush loop) can
 * report it. A missing file is `null`, not an error — that's what the
 * contract means by "absent", and it's how a fresh account reads as empty
 * rather than broken.
 */

import { createLocalStorageAdapter, DeviceLocalKeys } from './storage.js';
import { CONTENT_URL, RPC_URL, createAuthorizedFetch } from './sync/dropboxClient.js';

/** @param {string} key */
function pathFor(key) {
  return `/sekee-${key}.json`;
}

/** Dropbox passes call arguments in an HTTP header, which can only carry
 *  ASCII. Our keys always are, but escaping anything above it keeps that from
 *  being a latent trap if a key ever gains an accent. */
function apiArg(value) {
  return JSON.stringify(value).replace(
    /[\u0080-\uFFFF]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/**
 * @param {object} session from `dropboxClient.connect()`
 * @param {(session: object) => void} [onSessionChange] persists a refreshed token
 */
export function createDropboxAdapter(session, onSessionChange) {
  const authorizedFetch = createAuthorizedFetch(session, onSessionChange);
  const localOnly = createLocalStorageAdapter();

  return {
    isRemote: true,

    async read(key) {
      if (DeviceLocalKeys.has(key)) return localOnly.read(key);

      try {
        const response = await authorizedFetch(`${CONTENT_URL}/files/download`, {
          method: 'POST',
          headers: { 'Dropbox-API-Arg': apiArg({ path: pathFor(key) }) },
        });

        // A file this app has never written yet. Dropbox reports it as a 409
        // with a `path/not_found` summary, which is "absent", not a failure.
        if (response.status === 409) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return JSON.parse(await response.text());
      } catch (error) {
        console.warn(`[dropboxAdapter] could not read "${key}"`, error);
        return null;
      }
    },

    async write(key, value) {
      if (DeviceLocalKeys.has(key)) return localOnly.write(key, value);

      const response = await authorizedFetch(`${CONTENT_URL}/files/upload`, {
        method: 'POST',
        headers: {
          'Dropbox-API-Arg': apiArg({ path: pathFor(key), mode: 'overwrite', mute: true }),
          'Content-Type': 'application/octet-stream',
        },
        body: JSON.stringify(value),
      });

      if (!response.ok) {
        throw new Error(`Dropbox rejected the save (HTTP ${response.status}): ${await response.text()}`);
      }
    },

    async remove(key) {
      if (DeviceLocalKeys.has(key)) return localOnly.remove(key);

      try {
        const response = await authorizedFetch(`${RPC_URL}/files/delete_v2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: pathFor(key) }),
        });
        // Already gone is the outcome `remove` wanted.
        if (!response.ok && response.status !== 409) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        console.warn(`[dropboxAdapter] could not remove "${key}"`, error);
      }
    },

    /** No live channel — see `cachedRemoteAdapter.js`, which gives synced keys
     *  their cross-device updates by revalidating on read. Device-local keys
     *  keep localStorage's own cross-tab `storage` event. */
    subscribe(key, callback) {
      if (DeviceLocalKeys.has(key)) return localOnly.subscribe(key, callback);
      return () => {};
    },
  };
}
