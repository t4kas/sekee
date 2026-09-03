/**
 * Bookmark groups service
 * ---------------------------------------------------------------------------
 * Groups are the tabs shown above the bookmark grid. Same shape/conventions
 * as `bookmarksService.js`: every function is async, writes replace the
 * whole array, and `order` (not array position) decides display order so
 * reordering doesn't depend on rewriting every other field.
 *
 *   Group = { id: string, name: string, order: number }
 *
 * `DEFAULT_GROUP_ID` is a fixed (not randomly generated) id so
 * `bookmarksService.js` can reference "the default group" — the one
 * ungrouped/legacy bookmarks land in — without importing anything from this
 * file beyond that one constant, and without either file needing to call
 * into the other's read/write functions.
 */

import { storage, StorageKeys } from './storage.js';

export const DEFAULT_GROUP_ID = 'general';
const DEFAULT_GROUP_NAME = 'General';

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The seed group every install starts with. Also what a corrupted/emptied
 *  store falls back to — there must always be at least one group, since the
 *  grid always shows one. */
function seedGroups() {
  return [{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME, order: 0 }];
}

async function readAll() {
  const stored = await storage.read(StorageKeys.bookmarkGroups);
  if (Array.isArray(stored) && stored.length > 0) return stored;

  const seeded = seedGroups();
  await storage.write(StorageKeys.bookmarkGroups, seeded);
  return seeded;
}

function byOrder(a, b) {
  return a.order - b.order;
}

/** Writes `next` and returns it sorted by display order. Every exported
 *  function below returns through this, not the raw written array — a
 *  caller (`useBookmarkGroups.js`) renders whatever a mutation resolves
 *  with directly, so an unsorted return would show the old order until the
 *  next full reload. */
async function persist(next) {
  await storage.write(StorageKeys.bookmarkGroups, next);
  return [...next].sort(byOrder);
}

/** @returns {Promise<Array>} all groups, in display order. */
export async function listGroups() {
  const groups = await readAll();
  return [...groups].sort(byOrder);
}

/**
 * @param {string} name
 * @returns {Promise<Array>} the full updated list
 */
export async function createGroup(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Group name is required');

  const groups = await readAll();
  const next = [...groups, { id: createId(), name: trimmed, order: groups.length }];

  return persist(next);
}

/**
 * @param {string} id
 * @param {string} name
 * @returns {Promise<Array>} the full updated list
 */
export async function renameGroup(id, name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Group name is required');

  const groups = await readAll();
  const next = groups.map((group) => (group.id === id ? { ...group, name: trimmed } : group));

  return persist(next);
}

/**
 * Removes a group. Refuses to remove the last one — the grid always needs
 * somewhere to show bookmarks, and `bookmarksService.reassignGroup` (called
 * by `useBookmarkGroups.js` before this) needs a surviving group to move
 * that group's bookmarks into anyway.
 * @param {string} id
 * @returns {Promise<Array>} the full updated list
 */
export async function deleteGroup(id) {
  const groups = await readAll();
  if (groups.length <= 1) throw new Error('At least one group is required');

  const next = groups.filter((group) => group.id !== id).map((group, index) => ({ ...group, order: index }));

  return persist(next);
}

/**
 * Rewrites `order` to match `orderedIds` — used both by dragging group tabs
 * and by the up/down reorder control in Settings.
 * @param {string[]} orderedIds every group id, in the desired order
 * @returns {Promise<Array>} the full updated list
 */
export async function reorderGroups(orderedIds) {
  const groups = await readAll();
  const orderIndex = new Map(orderedIds.map((id, index) => [id, index]));

  const next = groups.map((group) =>
    orderIndex.has(group.id) ? { ...group, order: orderIndex.get(group.id) } : group,
  );

  return persist(next);
}

/** Lets the hook react to edits made in another tab. */
export function subscribeToGroups(callback) {
  return storage.subscribe(StorageKeys.bookmarkGroups, (value) => {
    const groups = Array.isArray(value) && value.length > 0 ? value : seedGroups();
    callback([...groups].sort(byOrder));
  });
}
