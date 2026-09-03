/**
 * Favorites service
 * ---------------------------------------------------------------------------
 * Favorited background photos. Unlike `bookmarksService.js`/`settingsService.js`,
 * this file does NOT go through `storage.js`'s swappable `storage` object —
 * it talks to `createSupabaseAdapter` directly, and every function takes an
 * explicit `userId`.
 *
 * WHY: "without an account, images cannot be favorited" means there's no
 * localStorage fallback for this feature at all. If this went through the
 * generic `storage` object, favorites would quietly work via localStorage
 * whenever `setActiveAdapter` happens to be pointed at
 * `createLocalStorageAdapter()` (i.e. whenever signed out) — exactly the
 * behaviour bookmarks/settings want, and exactly what favorites must not do.
 * Requiring a `userId` and building the adapter directly makes "signed out
 * means no favorites, full stop" true by construction rather than by
 * convention.
 *
 * Favorites are stored as one JSON array of full `Photo` records (see
 * `unsplashService.js`) under `StorageKeys.favorites`, in the same
 * `user_data` table bookmarks and settings already use — no new table. The
 * whole record is kept (not just the photo id) so a favorite can be shown
 * without ever re-fetching it from Unsplash: no extra API calls against the
 * 50/hour quota, and the photographer attribution Unsplash requires is
 * already attached.
 */

import { StorageKeys } from './storage.js';
import { createSupabaseAdapter } from './supabaseAdapter.js';

/**
 * @param {string} [userId]
 * @returns {Promise<Photo[]>}
 */
export async function listFavorites(userId) {
  if (!userId) return [];

  const stored = await createSupabaseAdapter(userId).read(StorageKeys.favorites);
  return Array.isArray(stored) ? stored : [];
}

/**
 * @param {string} userId
 * @param {Photo} photo
 * @returns {Promise<Photo[]>} the full updated list
 */
export async function addFavorite(userId, photo) {
  if (!userId) throw new Error('Sign in to save favorites.');

  const adapter = createSupabaseAdapter(userId);
  const current = await listFavorites(userId);

  // Already favorited — a no-op rather than a duplicate, since the heart
  // button's toggle can plausibly double-fire (fast double-click).
  if (current.some((favorite) => favorite.id === photo.id)) return current;

  const next = [...current, photo];
  await adapter.write(StorageKeys.favorites, next);
  return next;
}

/**
 * @param {string} userId
 * @param {string} photoId
 * @returns {Promise<Photo[]>} the full updated list
 */
export async function removeFavorite(userId, photoId) {
  if (!userId) throw new Error('Sign in to manage favorites.');

  const adapter = createSupabaseAdapter(userId);
  const current = await listFavorites(userId);
  const next = current.filter((favorite) => favorite.id !== photoId);

  await adapter.write(StorageKeys.favorites, next);
  return next;
}
