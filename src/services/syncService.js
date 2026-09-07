/**
 * Sync service
 * ---------------------------------------------------------------------------
 * Owns the answer to "where is this browser's data actually going right now?"
 * — the provider registry, the connection record that survives a reload, and
 * the one merge that runs when local data first meets an account's data.
 *
 * `useSync.js` is the only caller. Nothing here touches React, and nothing
 * here knows which provider it's holding.
 *
 * THREE KINDS OF DESTINATION:
 *   'local'     localStorage, the default — no account, nothing leaves the device
 *   'supabase'  the app's own backend, keyed to a signed-in account
 *   BYO         the user's own cloud storage (see `byoProviders` below)
 *
 * A BYO provider is an object:
 *   id, label, isConfigured
 *   connect()             -> Promise<Session>   interactive, opens a popup
 *   restore(session)      -> Promise<Session|null>  silent, on boot
 *   disconnect(session)   -> Promise<void>
 *   createAdapter(session, onSessionChange) -> Adapter, matching storage.js's
 *                         contract. `onSessionChange` persists a session the
 *                         adapter renewed mid-flight (a refreshed access
 *                         token), so the next page load doesn't have to
 *                         refresh all over again.
 * where a Session is `{ accountId, accountLabel, ...whatever the provider needs }`
 * and must be JSON-serialisable, because it's what gets persisted below.
 *
 * WHERE THE CONNECTION RECORD LIVES. Through a direct
 * `createLocalStorageAdapter()`, never through `storage` — routing it through
 * the swappable object would try to sync the record describing a remote INTO
 * that same remote, which is both circular and wrong: which cloud account
 * you've linked is a property of this device, not of your data.
 */

import { createLocalStorageAdapter, StorageKeys } from './storage.js';
import { DEFAULT_GROUP_ID } from './bookmarkGroupsService.js';
import * as dropbox from './sync/dropboxClient.js';
import { createDropboxAdapter } from './dropboxAdapter.js';

/** Bring-your-own-cloud providers, in the order the Sync tab lists them. */
export const byoProviders = [
  {
    id: 'dropbox',
    label: 'Dropbox',
    description: 'A folder in your own Dropbox, visible under Apps.',
    isConfigured: dropbox.isDropboxConfigured,
    connect: dropbox.connect,
    restore: dropbox.restore,
    disconnect: dropbox.disconnect,
    createAdapter: createDropboxAdapter,
  },
];

/** @param {string} id @returns {object|undefined} */
export function getByoProvider(id) {
  return byoProviders.find((provider) => provider.id === id);
}

// Device-local, deliberately outside `storage` — see the header.
const deviceStore = createLocalStorageAdapter();
const CONNECTION_KEY = 'sync-connection';

/** @returns {Promise<{providerId: string, session: object}|null>} */
export async function readConnection() {
  const stored = await deviceStore.read(CONNECTION_KEY);
  return stored?.providerId ? stored : null;
}

export function writeConnection(providerId, session) {
  return deviceStore.write(CONNECTION_KEY, { providerId, session });
}

export function clearConnection() {
  return deviceStore.remove(CONNECTION_KEY);
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Merges whatever's in this browser's localStorage into `remote`, once, the
 * first time this device connects to it.
 *
 * NEVER DELETES ANYTHING on either side, so a bug here loses nothing — worst
 * case is a stale local copy left behind. On a conflict the remote wins,
 * since it's the copy other devices are already agreeing on.
 *
 * Groups are unioned by name (case-insensitive), and local-only bookmarks get
 * their `groupId` remapped through that union before being appended.
 * Skipping the remap is why an earlier version could leave imported bookmarks
 * pointing at a group id that doesn't exist on the other device — they'd sync
 * fine and then be invisible, because no tab matches their group.
 *
 * @param {object} remote an adapter matching storage.js's contract. Pass the
 *   RAW remote, not a `createCachedRemoteAdapter` wrapper — this needs the
 *   backend's real current state, not a mirror of it.
 */
export async function migrateLocalDataToRemote(remote) {
  const local = createLocalStorageAdapter();

  const [localBookmarks, remoteBookmarks, localGroups, remoteGroups, localSettings, remoteSettings] =
    await Promise.all([
      local.read(StorageKeys.bookmarks),
      remote.read(StorageKeys.bookmarks),
      local.read(StorageKeys.bookmarkGroups),
      remote.read(StorageKeys.bookmarkGroups),
      local.read(StorageKeys.settings),
      remote.read(StorageKeys.settings),
    ]);

  // Settings: the remote's win if it has any; otherwise this device seeds them.
  if (!remoteSettings && localSettings) {
    await remote.write(StorageKeys.settings, localSettings);
  }

  const asArray = (value) => (Array.isArray(value) ? value : []);
  const remoteGroupList = asArray(remoteGroups);
  const localGroupList = asArray(localGroups);

  // --- groups: union by name, remembering how local ids map to merged ones
  const mergedGroups = [...remoteGroupList];
  const idByName = new Map(mergedGroups.map((group) => [group.name?.trim().toLowerCase(), group.id]));
  const usedIds = new Set(mergedGroups.map((group) => group.id));
  const groupIdMap = new Map();
  let nextGroupOrder = mergedGroups.reduce((max, group) => Math.max(max, group.order ?? 0), -1) + 1;

  for (const group of localGroupList) {
    const name = group.name?.trim().toLowerCase();
    const existingId = idByName.get(name);
    if (existingId) {
      groupIdMap.set(group.id, existingId);
      continue;
    }
    // Keep the local id where we can — it's what local bookmarks reference —
    // but a remote group already holding that id under a different name wins.
    const id = usedIds.has(group.id) ? createId('grp') : group.id;
    mergedGroups.push({ id, name: group.name, order: nextGroupOrder++ });
    usedIds.add(id);
    idByName.set(name, id);
    groupIdMap.set(group.id, id);
  }

  if (mergedGroups.length > remoteGroupList.length) {
    await remote.write(StorageKeys.bookmarkGroups, mergedGroups);
  }

  // --- bookmarks: union by url, with local-only entries remapped and re-ordered
  const remoteList = asArray(remoteBookmarks);
  const remoteUrls = new Set(remoteList.map((bookmark) => bookmark.url));
  const localOnly = asArray(localBookmarks).filter((bookmark) => !remoteUrls.has(bookmark.url));
  if (localOnly.length === 0) return;

  const usedBookmarkIds = new Set(remoteList.map((bookmark) => bookmark.id));
  const validGroupIds = new Set(mergedGroups.map((group) => group.id));
  // Where a bookmark's group can't be resolved at all. `DEFAULT_GROUP_ID` is
  // the usual answer, but an account whose groups were all renamed may not
  // have one, and a bookmark in a group that doesn't exist shows up nowhere.
  const fallbackGroupId = validGroupIds.has(DEFAULT_GROUP_ID)
    ? DEFAULT_GROUP_ID
    : (mergedGroups[0]?.id ?? DEFAULT_GROUP_ID);
  // Next free `order` per group, so appended bookmarks land after whatever
  // the account already has instead of colliding with its ordering.
  const nextOrder = new Map();
  for (const bookmark of remoteList) {
    const current = nextOrder.get(bookmark.groupId) ?? 0;
    nextOrder.set(bookmark.groupId, Math.max(current, (bookmark.order ?? 0) + 1));
  }

  const appended = localOnly.map((bookmark) => {
    const mapped = groupIdMap.get(bookmark.groupId) ?? bookmark.groupId;
    const groupId = validGroupIds.has(mapped) ? mapped : fallbackGroupId;
    const order = nextOrder.get(groupId) ?? 0;
    nextOrder.set(groupId, order + 1);

    const id = usedBookmarkIds.has(bookmark.id) ? createId('bkm') : bookmark.id;
    usedBookmarkIds.add(id);
    return { ...bookmark, id, groupId, order };
  });

  await remote.write(StorageKeys.bookmarks, [...remoteList, ...appended]);
}
