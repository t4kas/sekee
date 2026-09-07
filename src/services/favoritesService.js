/**
 * Favorites service
 * ---------------------------------------------------------------------------
 * Favorited background photos. Unlike `bookmarksService.js`/`settingsService.js`,
 * this file does NOT read or write through `storage.js`'s swappable `storage`
 * object — it asks `getRemoteAdapter()` for the active adapter and refuses to
 * do anything if there isn't one.
 *
 * WHY: "without an account, images cannot be favorited" means there's no
 * localStorage fallback for this feature at all. If this went through the
 * generic `storage` object, favorites would quietly work via localStorage
 * whenever no account is connected — exactly the behaviour bookmarks/settings
 * want, and exactly what favorites must not do. Going through
 * `getRemoteAdapter()` (which returns null unless a remote adapter is live)
 * makes "no account means no favorites, full stop" true by construction
 * rather than by convention.
 *
 * This used to build `createSupabaseAdapter(userId)` directly and take an
 * explicit `userId`. That kept the same guarantee but hardcoded one provider,
 * so favorites silently didn't work for anyone syncing to their own Google
 * Drive or Dropbox. `getRemoteAdapter()` is the provider-agnostic version of
 * the same question — see `storage.js`.
 *
 * Favorites are stored as one JSON array of full `Photo` records (see
 * `unsplashService.js`) under `StorageKeys.favorites`, alongside bookmarks
 * and settings in whatever backend is active. The whole record is kept (not
 * just the photo id) so a favorite can be shown without ever re-fetching it
 * from Unsplash: no extra API calls against the 50/hour quota, and the
 * photographer attribution Unsplash requires is already attached.
 */

import { getRemoteAdapter, StorageKeys } from './storage.js';

/** @returns {object} the active remote adapter, or throws `message`. */
function requireRemote(message) {
  const adapter = getRemoteAdapter();
  if (!adapter) throw new Error(message);
  return adapter;
}

/** @returns {Promise<Photo[]>} — empty when no account is connected. */
export async function listFavorites() {
  const adapter = getRemoteAdapter();
  if (!adapter) return [];

  const stored = await adapter.read(StorageKeys.favorites);
  return Array.isArray(stored) ? stored : [];
}

/**
 * @param {Photo} photo
 * @returns {Promise<Photo[]>} the full updated list
 */
export async function addFavorite(photo) {
  const adapter = requireRemote('Sign in to save favorites.');
  const current = await listFavorites();

  // Already favorited — a no-op rather than a duplicate, since the heart
  // button's toggle can plausibly double-fire (fast double-click).
  if (current.some((favorite) => favorite.id === photo.id)) return current;

  const next = [...current, photo];
  await adapter.write(StorageKeys.favorites, next);
  return next;
}

/**
 * @param {string} photoId
 * @returns {Promise<Photo[]>} the full updated list
 */
export async function removeFavorite(photoId) {
  const adapter = requireRemote('Sign in to manage favorites.');
  const current = await listFavorites();
  const next = current.filter((favorite) => favorite.id !== photoId);

  await adapter.write(StorageKeys.favorites, next);
  return next;
}
