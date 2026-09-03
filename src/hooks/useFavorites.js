/**
 * useFavorites
 * ---------------------------------------------------------------------------
 * The only thing components use to read or change favorited backgrounds.
 * Same `runMutation`-wrapped shape as `useBookmarks`, but keyed on a
 * `userId` rather than loading once — signing in or out re-runs the load,
 * and signing out naturally resolves to `[]` (see `favoritesService.listFavorites`),
 * so there's nothing extra to do to clear the list on sign-out.
 *
 * No cross-tab `subscribe`: `favoritesService.js` bypasses `storage.js`
 * entirely (see its header comment), and the Supabase adapter's `subscribe`
 * is a no-op for synced keys anyway — sync here is refresh-based, same as
 * bookmarks and settings.
 */

import { useCallback, useEffect, useState } from 'react';
import * as favoritesService from '../services/favoritesService.js';

/** @param {string} [userId] */
export function useFavorites(userId) {
  const [favorites, setFavorites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    favoritesService
      .listFavorites(userId)
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
  }, [userId]);

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
    (photo) => runMutation(() => favoritesService.addFavorite(userId, photo)),
    [runMutation, userId],
  );

  const removeFavorite = useCallback(
    (photoId) => runMutation(() => favoritesService.removeFavorite(userId, photoId)),
    [runMutation, userId],
  );

  return { favorites, isLoading, error, addFavorite, removeFavorite };
}
