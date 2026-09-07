/**
 * File providers
 * ---------------------------------------------------------------------------
 * The registry of cloud storage accounts a user can link, plus the record of
 * which one this device has linked.
 *
 * A provider is:
 *   id, label, description, isConfigured
 *   connect()             -> Promise<Session>       interactive, opens a popup
 *   restore(session)      -> Promise<Session|null>  silent, on boot
 *   disconnect(session)   -> Promise<void>
 *   createStore(session, onSessionChange) -> FileStore  (see dropboxFileStore.js)
 * where a Session is `{ accountId, accountLabel, ...provider state }` and must
 * be JSON-serialisable, because it's what gets persisted below.
 *
 * WHERE THE CONNECTION RECORD LIVES. In `localStorage`, through a direct
 * `createLocalStorageAdapter()` — never through the app's `storage` object.
 * Two reasons: `storage` syncs to the user's account, and which cloud account
 * you linked is a property of this device, not of your data; and the record
 * holds OAuth tokens, which have no business being copied into Postgres.
 *
 * These providers have NOTHING to do with where bookmarks and settings sync.
 * That's `useSync.js`, and it only ever chooses between an account and this
 * device. Linking Dropbox here adds a place to put files; it doesn't move
 * anything else.
 */

import { createLocalStorageAdapter } from '../storage.js';
import * as dropbox from './dropboxClient.js';
import * as googleDrive from './googleDriveClient.js';
import { createDropboxFileStore } from './dropboxFileStore.js';
import { createGoogleDriveFileStore } from './googleDriveFileStore.js';

/** In the order the Files tab lists them. */
export const fileProviders = [
  {
    id: 'dropbox',
    label: 'Dropbox',
    description: 'A folder in your own Dropbox, under Apps.',
    isConfigured: dropbox.isDropboxConfigured,
    connect: dropbox.connect,
    restore: dropbox.restore,
    disconnect: dropbox.disconnect,
    createStore: createDropboxFileStore,
  },
  {
    id: 'google-drive',
    label: 'Google Drive',
    description: 'A “sekee” folder in your own Google Drive.',
    isConfigured: googleDrive.isGoogleDriveConfigured,
    connect: googleDrive.connect,
    restore: googleDrive.restore,
    disconnect: googleDrive.disconnect,
    createStore: createGoogleDriveFileStore,
  },
];

/** @param {string} id */
export function getFileProvider(id) {
  return fileProviders.find((provider) => provider.id === id);
}

/** Providers this build actually has keys for. */
export function getAvailableFileProviders() {
  return fileProviders.filter((provider) => provider.isConfigured);
}

// Device-local, deliberately outside `storage` — see the header.
const deviceStore = createLocalStorageAdapter();
const CONNECTION_KEY = 'file-provider';

/** @returns {Promise<{providerId: string, session: object}|null>} */
export async function readFileConnection() {
  const stored = await deviceStore.read(CONNECTION_KEY);
  return stored?.providerId ? stored : null;
}

export function writeFileConnection(providerId, session) {
  return deviceStore.write(CONNECTION_KEY, { providerId, session });
}

export function clearFileConnection() {
  return deviceStore.remove(CONNECTION_KEY);
}
