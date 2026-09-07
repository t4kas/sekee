/**
 * Settings service
 * ---------------------------------------------------------------------------
 * The user's preferences: which search engine to use and which background
 * category to pull photos from. Same async shape as the bookmarks service,
 * for the same swap-in-a-backend reason.
 */

import { storage, StorageKeys } from './storage.js';
import { DEFAULT_ENGINE_ID } from './searchEngines.js';
import { DEFAULT_CATEGORY_ID } from './backgroundCategories.js';

/** Used on first run and as a base for merging (see `loadSettings`). */
export const DEFAULT_SETTINGS = {
  engineId: DEFAULT_ENGINE_ID,
  categoryId: DEFAULT_CATEGORY_ID,
  // `categoryId: 'favorites'` is a sentinel handled by `useBackground.js`,
  // not a real entry in `backgroundCategories.js` — these two fields are
  // only meaningful when it's selected. See `useBackground.js`.
  favoritesMode: 'shuffle', // 'shuffle' | 'fixed'
  pinnedFavoriteId: null, // which favorite to always show when 'fixed'
  // `categoryId: 'custom'` is the second sentinel: show an image the user
  // uploaded to their own cloud storage (see `customBackgroundService.js`).
  // Only meaningful then — null means "shuffle among the uploads".
  customBackgroundId: null,
  weatherLocation: '', // empty = widget is hidden, see WeatherWidget.jsx
  weatherUnits: 'celsius', // 'celsius' | 'fahrenheit'
  // 'custom' respects each bookmark's `order` (drag-and-drop, see
  // bookmarksService.js) — 'recent' sorts by `lastOpenedAt` instead, and
  // disables dragging since there's nothing left to manually order. One
  // global mode rather than per-group, see BookmarkGrid.jsx.
  bookmarkSortMode: 'custom', // 'custom' | 'recent'
};

/**
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 *
 * Stored settings are spread OVER the defaults rather than used directly.
 * That way, when a future version adds a new setting, someone with an old
 * saved object still gets a sensible value for it instead of `undefined`.
 */
export async function loadSettings() {
  const stored = await storage.read(StorageKeys.settings);
  // Spreading null/undefined is a no-op, so a missing value is fine here.
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Merges a partial change into the saved settings.
 * @param {Partial<typeof DEFAULT_SETTINGS>} changes
 * @returns {Promise<typeof DEFAULT_SETTINGS>} the full updated settings
 */
export async function saveSettings(changes) {
  const current = await loadSettings();
  const next = { ...current, ...changes };

  await storage.write(StorageKeys.settings, next);
  return next;
}

/** Lets the hook react to settings changed in another tab. */
export function subscribeToSettings(callback) {
  return storage.subscribe(StorageKeys.settings, (value) => {
    callback({ ...DEFAULT_SETTINGS, ...value });
  });
}
