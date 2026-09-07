/**
 * Google Drive file store
 * ---------------------------------------------------------------------------
 * Files in a `sekee` folder in the user's own Drive. Implements the same
 * contract as `dropboxFileStore.js` — see its header for the method list.
 *
 * WHY A REAL, VISIBLE FOLDER. The `drive.file` scope covers files this app
 * created, wherever they sit, so they show up in the user's Drive like
 * anything else: they can see them, move them, and know they own them. That's
 * the point of storing files in someone's own account, and it's what the
 * hidden `appDataFolder` would take away.
 *
 * PATHS ARE FLAT-ISH. Drive has no paths, only parent ids, so this maps
 * `photos/cat.png` to a folder chain under `sekee` and resolves it a segment
 * at a time. Resolved ids are memoised per store instance, because otherwise
 * every call would re-walk the chain and spend requests doing it.
 *
 * ABOUT `getViewUrl`. Drive won't serve a `drive.file` file to an `<img>` tag
 * without making it shared, which is not this app's decision to make on
 * someone's behalf. So this downloads the bytes and hands back a `blob:` URL
 * — which works anywhere a URL does, but is held in this page's memory until
 * it's released. `releaseViewUrl` is not optional here: without it, viewing
 * images leaks a copy of each one for the life of the tab.
 */

import {
  DRIVE_FILES_URL,
  DRIVE_UPLOAD_URL,
  createAuthorizedFetch,
} from './googleDriveClient.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_FOLDER_NAME = 'sekee';

/** Drive's query language quotes with `'`, so a name containing one would end
 *  the string early and change the query's meaning. */
function escapeQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function splitPath(path) {
  const segments = path.split('/').filter(Boolean);
  return { folders: segments.slice(0, -1), name: segments.at(-1) };
}

function toFileRef(file, path) {
  return {
    path,
    name: file.name,
    size: Number(file.size ?? 0),
    modifiedAt: file.modifiedTime ? Date.parse(file.modifiedTime) : null,
  };
}

/**
 * @param {object} session from `googleDriveClient.connect()`
 * @param {(session: object) => void} [onSessionChange] persists a renewed token
 */
export function createGoogleDriveFileStore(session, onSessionChange) {
  const authorizedFetch = createAuthorizedFetch(session, onSessionChange);

  /** 'folder:<parentId>/<name>' or 'file:<parentId>/<name>' -> Drive id */
  const idCache = new Map();

  async function findChild(parentId, name, { foldersOnly = false } = {}) {
    const cacheKey = `${foldersOnly ? 'folder' : 'file'}:${parentId}/${name}`;
    if (idCache.has(cacheKey)) return idCache.get(cacheKey);

    const clauses = [
      `name = '${escapeQuery(name)}'`,
      `'${parentId}' in parents`,
      'trashed = false',
      foldersOnly ? `mimeType = '${FOLDER_MIME}'` : `mimeType != '${FOLDER_MIME}'`,
    ];
    const query = new URLSearchParams({
      q: clauses.join(' and '),
      fields: 'files(id,name,size,modifiedTime)',
      pageSize: '1',
    });

    const response = await authorizedFetch(`${DRIVE_FILES_URL}?${query}`);
    if (!response.ok) throw new Error(`Google Drive rejected the lookup (HTTP ${response.status}).`);

    const file = (await response.json()).files?.[0] ?? null;
    idCache.set(cacheKey, file?.id ?? null);
    return file?.id ?? null;
  }

  async function createFolder(parentId, name) {
    const response = await authorizedFetch(`${DRIVE_FILES_URL}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
    if (!response.ok) throw new Error(`Google Drive rejected the folder (HTTP ${response.status}).`);

    const { id } = await response.json();
    idCache.set(`folder:${parentId}/${name}`, id);
    return id;
  }

  /**
   * Walks (and optionally creates) the folder chain for a path.
   * @param {boolean} create false when reading — a missing folder then just
   *   means "no such file", and creating one would be a surprising side effect
   *   of a `download` or a `list`.
   */
  async function resolveFolder(folders, create) {
    let parentId = await findChild('root', ROOT_FOLDER_NAME, { foldersOnly: true });
    if (!parentId) {
      if (!create) return null;
      parentId = await createFolder('root', ROOT_FOLDER_NAME);
    }

    for (const folder of folders) {
      let nextId = await findChild(parentId, folder, { foldersOnly: true });
      if (!nextId) {
        if (!create) return null;
        nextId = await createFolder(parentId, folder);
      }
      parentId = nextId;
    }
    return parentId;
  }

  async function downloadFile(path) {
    const { folders, name } = splitPath(path);
    const parentId = await resolveFolder(folders, false);
    if (!parentId) return null;

    const fileId = await findChild(parentId, name);
    if (!fileId) return null;

    const response = await authorizedFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`);
    if (response.status === 404) {
      // Deleted elsewhere — forget the id so the next call looks it up again
      // instead of repeating a request that can't succeed.
      idCache.delete(`file:${parentId}/${name}`);
      return null;
    }
    if (!response.ok) throw new Error(`Google Drive rejected the download (HTTP ${response.status}).`);
    return response.blob();
  }

  return {
    id: 'google-drive',
    /** `blob:` URLs, valid only in this tab and only until released. */
    hasStableUrls: false,

    async upload(path, blob, { contentType } = {}) {
      const { folders, name } = splitPath(path);
      const parentId = await resolveFolder(folders, true);
      const existingId = await findChild(parentId, name);
      const type = contentType || blob.type || 'application/octet-stream';

      if (existingId) {
        const response = await authorizedFetch(
          `${DRIVE_UPLOAD_URL}/${existingId}?uploadType=media&fields=id,name,size,modifiedTime`,
          { method: 'PATCH', headers: { 'Content-Type': type }, body: blob },
        );
        if (!response.ok) {
          throw new Error(`Google Drive rejected the upload (HTTP ${response.status}).`);
        }
        return toFileRef(await response.json(), path);
      }

      // A new file needs its metadata (name and parent) alongside the bytes,
      // which is what multipart is for. `Blob` parts keep this binary-safe —
      // building the body as a string would corrupt anything that isn't text.
      const boundary = `sekee-${crypto.randomUUID()}`;
      const metadata = { name, parents: [parentId] };
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
        blob,
        `\r\n--${boundary}--\r\n`,
      ]);

      const response = await authorizedFetch(
        `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,size,modifiedTime`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      if (!response.ok) {
        throw new Error(`Google Drive rejected the upload (HTTP ${response.status}).`);
      }

      const file = await response.json();
      idCache.set(`file:${parentId}/${name}`, file.id);
      return toFileRef(file, path);
    },

    download: downloadFile,

    // Deliberately not `this.download`: these stores get destructured and
    // passed around, and a method that depends on its receiver breaks the
    // moment one is.
    async getViewUrl(path) {
      const blob = await downloadFile(path);
      return blob ? URL.createObjectURL(blob) : null;
    },

    /** Required, not optional — see the header. */
    releaseViewUrl(url) {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    },

    async remove(path) {
      const { folders, name } = splitPath(path);
      const parentId = await resolveFolder(folders, false);
      if (!parentId) return;

      const fileId = await findChild(parentId, name);
      if (!fileId) return; // already the outcome `remove` wanted

      const response = await authorizedFetch(`${DRIVE_FILES_URL}/${fileId}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Google Drive rejected the delete (HTTP ${response.status}).`);
      }
      idCache.delete(`file:${parentId}/${name}`);
    },

    async list(prefix = '') {
      const folders = prefix.split('/').filter(Boolean);
      const parentId = await resolveFolder(folders, false);
      if (!parentId) return [];

      const query = new URLSearchParams({
        q: `'${parentId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`,
        fields: 'files(id,name,size,modifiedTime)',
        pageSize: '100',
      });
      const response = await authorizedFetch(`${DRIVE_FILES_URL}?${query}`);
      if (!response.ok) throw new Error(`Google Drive rejected the listing (HTTP ${response.status}).`);

      const base = folders.length > 0 ? `${folders.join('/')}/` : '';
      return (await response.json()).files.map((file) => toFileRef(file, `${base}${file.name}`));
    },
  };
}
