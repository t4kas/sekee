/**
 * Google Drive storage adapter
 * ---------------------------------------------------------------------------
 * Same four-method contract as `supabaseAdapter.js` and `dropboxAdapter.js`,
 * backed by one JSON file per key in the user's own Drive — inside
 * `appDataFolder`, the hidden per-app space described in
 * `sync/googleDriveClient.js`.
 *
 * WHY THERE'S AN ID CACHE HERE AND NOT IN THE DROPBOX ADAPTER. Dropbox
 * addresses files by path, so a write is one request. Drive addresses them by
 * an opaque id, so writing means first asking "does a file called
 * `sekee-bookmarks.json` exist in appDataFolder, and what's its id?". Doing
 * that on every call would double the request count against a quota, so ids
 * are memoised per adapter instance after the first lookup. They're stable
 * for the life of a file, and a wrong one produces a 404 that the next lookup
 * corrects.
 *
 * CREATE VS UPDATE are different endpoints and different verbs in Drive
 * (multipart POST to place a new file in appDataFolder; media PATCH to
 * replace an existing one's contents), which is the other thing the id cache
 * decides between.
 *
 * WRAP THIS IN `createCachedRemoteAdapter` — `useSync` does. Every read here
 * is one or two network round-trips, which a new-tab page cannot wait on, and
 * this app rewrites the whole bookmarks blob on every bookmark click.
 */

import { createLocalStorageAdapter, DeviceLocalKeys } from './storage.js';
import {
  DRIVE_FILES_URL,
  DRIVE_UPLOAD_URL,
  createAuthorizedFetch,
} from './sync/googleDriveClient.js';

/** @param {string} key */
function fileNameFor(key) {
  return `sekee-${key}.json`;
}

/**
 * @param {object} session from `googleDriveClient.connect()`
 * @param {(session: object) => void} [onSessionChange] persists a renewed token
 */
export function createGoogleDriveAdapter(session, onSessionChange) {
  const authorizedFetch = createAuthorizedFetch(session, onSessionChange);
  const localOnly = createLocalStorageAdapter();

  /** key -> Drive file id. Also caches "no file yet" as null, so a fresh
   *  account doesn't re-run the lookup on every read. */
  const fileIds = new Map();

  /** @returns {Promise<string|null>} the file's Drive id, or null if absent */
  async function findFileId(key) {
    if (fileIds.has(key)) return fileIds.get(key);

    const query = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name = '${fileNameFor(key)}' and trashed = false`,
      fields: 'files(id)',
      pageSize: '1',
    });
    const response = await authorizedFetch(`${DRIVE_FILES_URL}?${query}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const id = (await response.json()).files?.[0]?.id ?? null;
    fileIds.set(key, id);
    return id;
  }

  return {
    isRemote: true,

    async read(key) {
      if (DeviceLocalKeys.has(key)) return localOnly.read(key);

      try {
        const fileId = await findFileId(key);
        if (!fileId) return null; // never written — "absent", per the contract

        const response = await authorizedFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`);
        if (response.status === 404) {
          // Deleted from another device. Forget the id so the next call looks
          // it up again rather than repeating a request that can't succeed.
          fileIds.delete(key);
          return null;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return JSON.parse(await response.text());
      } catch (error) {
        console.warn(`[googleDriveAdapter] could not read "${key}"`, error);
        return null;
      }
    },

    async write(key, value) {
      if (DeviceLocalKeys.has(key)) return localOnly.write(key, value);

      const body = JSON.stringify(value);
      const fileId = await findFileId(key);

      if (fileId) {
        const response = await authorizedFetch(
          `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body },
        );
        if (!response.ok) {
          throw new Error(`Google Drive rejected the save (HTTP ${response.status}).`);
        }
        return;
      }

      // No file yet: a multipart upload is what carries the metadata (the
      // name, and `parents: ['appDataFolder']` — without which the file would
      // land loose in the user's actual Drive) alongside the contents.
      const boundary = `sekee-${crypto.randomUUID()}`;
      const metadata = { name: fileNameFor(key), parents: ['appDataFolder'] };
      const multipart = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        body,
        `--${boundary}--`,
        '',
      ].join('\r\n');

      const response = await authorizedFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      });
      if (!response.ok) {
        throw new Error(`Google Drive rejected the save (HTTP ${response.status}).`);
      }

      fileIds.set(key, (await response.json()).id);
    },

    async remove(key) {
      if (DeviceLocalKeys.has(key)) return localOnly.remove(key);

      try {
        const fileId = await findFileId(key);
        if (!fileId) return; // already the outcome `remove` wanted

        const response = await authorizedFetch(`${DRIVE_FILES_URL}/${fileId}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
        fileIds.set(key, null);
      } catch (error) {
        console.warn(`[googleDriveAdapter] could not remove "${key}"`, error);
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
