/**
 * useCustomBackgrounds
 * ---------------------------------------------------------------------------
 * The only way components reach `customBackgroundService.js`: the list of
 * uploaded background images, plus uploading and deleting them. Same
 * `runMutation` shape as `useFavorites`/`useBookmarks`.
 *
 * TWO KEYS, BECAUSE THE FEATURE HAS TWO HALVES (see the service's header).
 * The records live wherever data currently syncs, so connecting or leaving
 * an account has to reload them — that's `accountKey`, from `useSync`, the
 * same input `useFavorites` takes. The images live in the linked file
 * provider, so linking or unlinking one changes what can actually be
 * resolved — that's `providerKey`. Neither alone covers both.
 *
 * `isLoading` DELIBERATELY STAYS TRUE UNTIL THE PROVIDER HAS FINISHED
 * RESTORING, not just until the records are read. `useBackground.js` waits
 * on it before picking a photo; without that wait, a page load with an
 * upload selected would resolve against a store that isn't registered yet,
 * fall back to an Unsplash photo, and then visibly swap.
 */

import { useCallback, useEffect, useState } from 'react';
import * as customBackgroundService from '../services/customBackgroundService.js';

/**
 * @param {object} [options]
 * @param {string|null} [options.accountKey] from `useSync` — where records go
 * @param {string|null} [options.providerKey] the linked file provider's id
 * @param {boolean} [options.isProviderRestoring] from `useFileProvider`
 */
export function useCustomBackgrounds({ accountKey, providerKey, isProviderRestoring } = {}) {
  const [backgrounds, setBackgrounds] = useState([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingRecords(true);

    customBackgroundService
      .listCustomBackgrounds()
      .then((list) => {
        if (isMounted) setBackgrounds(list);
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError);
      })
      .finally(() => {
        if (isMounted) setIsLoadingRecords(false);
      });

    return () => {
      isMounted = false;
    };
  }, [accountKey, providerKey]);

  /** Runs a service call and stores the list it returns; errors reach the
   *  caller as well as `error`, so a form can show them inline. */
  const runMutation = useCallback(async (operation) => {
    setError(null);
    try {
      const result = await operation();
      setBackgrounds(Array.isArray(result) ? result : result.backgrounds);
      return result;
    } catch (mutationError) {
      setError(mutationError);
      throw mutationError;
    }
  }, []);

  /**
   * @param {File} file
   * @returns {Promise<CustomBackground>} the record that was just created
   */
  const upload = useCallback(
    async (file) => {
      setIsUploading(true);
      try {
        const { added } = await runMutation(() => customBackgroundService.addCustomBackground(file));
        return added;
      } finally {
        setIsUploading(false);
      }
    },
    [runMutation],
  );

  const remove = useCallback(
    (id) => runMutation(() => customBackgroundService.removeCustomBackground(id)),
    [runMutation],
  );

  return {
    backgrounds,
    /** True until both halves are ready — see the header. */
    isLoading: isLoadingRecords || Boolean(isProviderRestoring),
    isUploading,
    error,
    upload,
    remove,
  };
}

/**
 * Resolves a list of uploads to viewable URLs, and releases them again on
 * unmount or whenever the list changes.
 *
 * Its own hook rather than part of the one above because the two have
 * genuinely different lifetimes: the records are needed by `App.jsx` for as
 * long as the page is open, while these URLs — a `blob:` handle holding a
 * whole image in memory on Drive — should only exist while the thumbnails
 * are actually on screen, i.e. while the Settings modal's Uploads sub-tab is
 * mounted.
 *
 * @param {CustomBackground[]} backgrounds
 * @returns {Record<string, string>} record id → URL, filled in as they resolve
 */
export function useCustomBackgroundThumbnails(backgrounds) {
  const [urls, setUrls] = useState({});

  // Only the paths matter, and a re-render with an equal-but-new array
  // shouldn't re-download every image on Drive.
  const key = backgrounds.map((background) => `${background.id}:${background.path}`).join('|');

  useEffect(() => {
    let isMounted = true;
    const resolved = [];

    Promise.all(
      backgrounds.map(async (background) => {
        const photo = await customBackgroundService.resolveCustomBackgroundPhoto(background);
        if (!photo) return;

        resolved.push(photo);
        // Set them one at a time rather than after Promise.all, so a slow
        // provider fills the grid in instead of showing nothing until the
        // last one lands.
        if (isMounted) setUrls((current) => ({ ...current, [background.id]: photo.imageUrl }));
      }),
    ).catch(() => {}); // resolve already logs and returns null; nothing to add

    return () => {
      isMounted = false;
      setUrls({});
      for (const photo of resolved) customBackgroundService.releaseCustomBackgroundPhoto(photo);
    };
    // Deliberately keyed on `key`, not on `backgrounds` itself — see its
    // comment above.
  }, [key]);

  return urls;
}
