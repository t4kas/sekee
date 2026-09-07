/**
 * Dropbox file store
 * ---------------------------------------------------------------------------
 * Files in the user's own Dropbox App folder (`Apps/<app name>/`), which is
 * all this app's token can reach.
 *
 * THE CONTRACT every file store implements — see `fileStorageService.js` for
 * how the two stores are chosen between:
 *
 *   upload(path, blob, {contentType}) -> Promise<FileRef>
 *   download(path)                    -> Promise<Blob | null>   null if absent
 *   getViewUrl(path)                  -> Promise<string | null> for <img src>
 *   releaseViewUrl(url)               -> void   pairs with getViewUrl
 *   remove(path)                      -> Promise<void>
 *   list(prefix)                      -> Promise<FileRef[]>
 *
 * where FileRef is `{ path, name, size, modifiedAt }`.
 *
 * ABOUT `getViewUrl`. Dropbox can mint a real, directly-renderable link
 * (`get_temporary_link`), but it EXPIRES — currently about four hours. So a
 * URL from here is fine to put in an `<img src>` now and wrong to persist in
 * a database or a bookmark. Anything that needs to survive belongs in the
 * shared store instead (see `supabaseFileStore.js`). `releaseViewUrl` is a
 * no-op here; it exists because the Drive store's URLs really do need
 * releasing, and callers shouldn't have to know which store they got.
 */

import { CONTENT_URL, RPC_URL, createAuthorizedFetch } from './dropboxClient.js';

/** Dropbox paths are absolute within the app folder and must start with `/`. */
function toDropboxPath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

/** Call arguments ride in an HTTP header, which can only carry ASCII — a
 *  filename with an accent in it would otherwise make the request unsendable. */
function apiArg(value) {
  return JSON.stringify(value).replace(
    /[\u0080-\uFFFF]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

function toFileRef(entry) {
  return {
    path: entry.path_display ?? entry.path_lower,
    name: entry.name,
    size: entry.size ?? 0,
    modifiedAt: entry.server_modified ? Date.parse(entry.server_modified) : null,
  };
}

/**
 * @param {object} session from `dropboxClient.connect()`
 * @param {(session: object) => void} [onSessionChange] persists a refreshed token
 */
export function createDropboxFileStore(session, onSessionChange) {
  const authorizedFetch = createAuthorizedFetch(session, onSessionChange);

  return {
    id: 'dropbox',
    /** No permanent public URLs — see the note above. */
    hasStableUrls: false,

    async upload(path, blob, { contentType } = {}) {
      const response = await authorizedFetch(`${CONTENT_URL}/files/upload`, {
        method: 'POST',
        headers: {
          'Dropbox-API-Arg': apiArg({ path: toDropboxPath(path), mode: 'overwrite', mute: true }),
          'Content-Type': contentType || blob.type || 'application/octet-stream',
        },
        body: blob,
      });
      if (!response.ok) {
        throw new Error(`Dropbox rejected the upload (HTTP ${response.status}).`);
      }
      return toFileRef(await response.json());
    },

    async download(path) {
      const response = await authorizedFetch(`${CONTENT_URL}/files/download`, {
        method: 'POST',
        headers: { 'Dropbox-API-Arg': apiArg({ path: toDropboxPath(path) }) },
      });
      // 409 with a `path/not_found` summary is Dropbox for "no such file".
      if (response.status === 409) return null;
      if (!response.ok) throw new Error(`Dropbox rejected the download (HTTP ${response.status}).`);
      return response.blob();
    },

    async getViewUrl(path) {
      const response = await authorizedFetch(`${RPC_URL}/files/get_temporary_link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: toDropboxPath(path) }),
      });
      if (!response.ok) return null;
      return (await response.json()).link ?? null;
    },

    /** Dropbox's links are ordinary URLs — nothing to release. */
    releaseViewUrl() {},

    async remove(path) {
      const response = await authorizedFetch(`${RPC_URL}/files/delete_v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: toDropboxPath(path) }),
      });
      // Already gone is the outcome `remove` wanted.
      if (!response.ok && response.status !== 409) {
        throw new Error(`Dropbox rejected the delete (HTTP ${response.status}).`);
      }
    },

    async list(prefix = '') {
      // The app folder's own root is addressed as '', not '/' — Dropbox
      // rejects a lone slash.
      const path = prefix ? toDropboxPath(prefix).replace(/\/$/, '') : '';
      const response = await authorizedFetch(`${RPC_URL}/files/list_folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (response.status === 409) return []; // folder doesn't exist yet
      if (!response.ok) throw new Error(`Dropbox rejected the listing (HTTP ${response.status}).`);

      const { entries = [] } = await response.json();
      return entries.filter((entry) => entry['.tag'] === 'file').map(toFileRef);
    },
  };
}
