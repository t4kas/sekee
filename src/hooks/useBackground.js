/**
 * useBackground
 * ---------------------------------------------------------------------------
 * Picks the background photo for this page load, preloads it, and handles
 * Unsplash's required download-tracking ping.
 *
 * WHY PRELOAD: if we set the <img> src and let the browser paint it as it
 * streams in, you see a photo wipe down the screen. Instead we load it into
 * an off-screen Image first and only hand it to the UI once it's decoded,
 * which lets the component fade it in cleanly.
 *
 * FAVORITES: `settings.categoryId === 'favorites'` is a sentinel (see
 * `settingsService.js`) meaning "show a favorited photo instead of fetching
 * one from Unsplash" — either shuffled or pinned to one, per
 * `settings.favoritesMode`/`pinnedFavoriteId`. `resolvePhoto` below is where
 * that branch happens; `getBackgroundPhoto` never sees the literal
 * `'favorites'` string, since it isn't a real category and would otherwise
 * get cached under a bogus pool key.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBackgroundPhoto, pickRandom, trackPhotoUse } from '../services/unsplashService.js';
import { DEFAULT_CATEGORY_ID } from '../services/backgroundCategories.js';

/**
 * Decides which photo to show: a favorite (shuffled or pinned) if that's
 * what's selected and there's at least one to choose from, otherwise a
 * normal Unsplash fetch for the category.
 *
 * @param {{categoryId: string, favoritesMode: string, pinnedFavoriteId: string|null}} settings
 * @param {Photo[]} favorites
 * @returns {Promise<Photo>}
 */
async function resolvePhoto(settings, favorites) {
  if (settings.categoryId === 'favorites' && favorites.length > 0) {
    if (settings.favoritesMode === 'fixed') {
      const pinned = favorites.find((favorite) => favorite.id === settings.pinnedFavoriteId);
      // Falls back to a random favorite if the pinned one was since
      // unfavorited, rather than getting stuck on a photo that's gone.
      return pinned ?? pickRandom(favorites);
    }
    return pickRandom(favorites);
  }

  // Either an ordinary category, or 'favorites' with nothing to show yet
  // (signed out, or everything unfavorited) — fetch normally, falling back
  // to the default category rather than passing the sentinel through.
  const categoryId = settings.categoryId === 'favorites' ? DEFAULT_CATEGORY_ID : settings.categoryId;
  return getBackgroundPhoto(categoryId);
}

/** Loads an image off-screen. Resolves either way — a photo that fails to
 *  decode still gets shown; the component just won't have the fade. */
function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
  });
}

/**
 * @param {{categoryId: string, favoritesMode: string, pinnedFavoriteId: string|null}} settings
 * @param {Photo[]} favorites
 * @returns {{ photo: Photo|null, isLoading: boolean, refresh: () => void }}
 */
export function useBackground(settings, favorites) {
  const [photo, setPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Bumping this forces the effect to re-run — that's the "New photo" button.
  const [refreshCount, setRefreshCount] = useState(0);

  // Remembers which photos we've already reported to Unsplash. React's
  // StrictMode runs effects twice in development, and we don't want the
  // tracking endpoint pinged twice for one photo.
  const trackedPhotoIds = useRef(new Set());

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    resolvePhoto(settings, favorites)
      .then(async (nextPhoto) => {
        await preloadImage(nextPhoto.imageUrl);
        if (!isMounted) return;

        setPhoto(nextPhoto);
        setIsLoading(false);

        // The photo is now genuinely in use, which is the moment Unsplash's
        // guidelines say to ping. (No-ops for bundled fallbacks.)
        if (!trackedPhotoIds.current.has(nextPhoto.id)) {
          trackedPhotoIds.current.add(nextPhoto.id);
          trackPhotoUse(nextPhoto);
        }
      })
      .catch((error) => {
        // getBackgroundPhoto is written not to throw, but if it somehow does
        // we still need to stop showing a loading state forever.
        console.warn('[background] could not load a photo:', error);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
    // Deliberately NOT depending on `favorites` here — see the effect below
    // for why. This one only re-picks on an actual settings change or an
    // explicit "New photo".
  }, [settings.categoryId, settings.favoritesMode, settings.pinnedFavoriteId, refreshCount]);

  // If the photo currently on screen falls out of `favorites` — unfavorited
  // from the gallery, possibly the pinned one — replace it. This is the
  // ONLY reason `useBackground` should react to `favorites` changing at
  // all: adding a favorite (including the one already on screen) or
  // removing some other one shouldn't disturb what's currently shown, which
  // is exactly what happened when `favorites` sat in the effect above's own
  // dependency list — any mutation re-ran `resolvePhoto` from scratch and
  // could land on a different photo than the one just favorited.
  useEffect(() => {
    if (settings.categoryId !== 'favorites') return;
    if (!photo) return;
    if (favorites.some((favorite) => favorite.id === photo.id)) return;

    // Reuses the "New photo" trigger rather than duplicating the picking
    // logic above.
    setRefreshCount((count) => count + 1);
  }, [favorites, settings.categoryId, photo]);

  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  return { photo, isLoading, refresh };
}
