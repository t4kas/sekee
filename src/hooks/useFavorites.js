/**
 * useFavorites
 * ---------------------------------------------------------------------------
 * The only thing components use to read or change favorited backgrounds.
 * Same `runMutation`-wrapped shape as `useBookmarks`, but keyed on an
 * `accountKey` rather than loading once — connecting or disconnecting an
 * account re-runs the load, and having no account naturally resolves to `[]`
 * (see `favoritesService.listFavorites`), so there's nothing extra to do to
 * clear the list on sign-out.
 *
 * `accountKey` comes from `useSync` and identifies the provider AND the
 * account, not just the user: switching from a Supabase sign-in to a linked
 * Dropbox has to reload favorites just as much as signing out does, because
 * they're stored per-destination.
 *
 * No cross-tab `subscribe`: `favoritesService.js` doesn't go through
 * `storage.js`'s subscribable object (see its header comment) — sync here is
 * refresh-based, same as bookmarks and settings.
 */

import { useCallback, useEffect, useState } from 'react';
import * as favoritesService from '../services/favoritesService.js';

/** @param {string|null} [accountKey] from `useSync` — null when device-only */
export function useFavorites(accountKey) {
  const [favorites, setFavorites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    favoritesService
      .listFavorites()
      .then((list) => {
        if (isMounted) setFavorites(list);
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [accountKey]);

  /** Same pattern as `useBookmarks`'s `runMutation`: run it, store the
   *  returned list, let errors bubble to the caller. */
  const runMutation = useCallback(async (operation) => {
    setError(null);
    try {
      const next = await operation();
      setFavorites(next);
      return next;
    } catch (mutationError) {
      setError(mutationError);
      throw mutationError;
    }
  }, []);

  const addFavorite = useCallback(
    (photo) => runMutation(() => favoritesService.addFavorite(photo)),
    [runMutation],
  );

  const removeFavorite = useCallback(
    (photoId) => runMutation(() => favoritesService.removeFavorite(photoId)),
    [runMutation],
  );

  return { favorites, isLoading, error, addFavorite, removeFavorite };
}
