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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBackgroundPhoto, trackPhotoUse } from '../services/unsplashService.js';

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
 * @param {string} categoryId  which category to pull from
 * @returns {{ photo: Photo|null, isLoading: boolean, refresh: () => void }}
 */
export function useBackground(categoryId) {
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

    getBackgroundPhoto(categoryId)
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
  }, [categoryId, refreshCount]);

  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  return { photo, isLoading, refresh };
}
