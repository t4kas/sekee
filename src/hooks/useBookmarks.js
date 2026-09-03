/**
 * useBookmarks
 * ---------------------------------------------------------------------------
 * The only thing components use to read or change bookmarks. It owns the
 * loading state and keeps React's copy of the list in sync with storage.
 *
 * Because the service layer is already async, this hook would work unchanged
 * against a real backend.
 */

import { useCallback, useEffect, useState } from 'react';
import * as bookmarksService from '../services/bookmarksService.js';

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initial load, plus a subscription so edits made in another open tab
  // show up here too.
  useEffect(() => {
    let isMounted = true;

    bookmarksService
      .listBookmarks()
      .then((list) => {
        // Guard against setting state after the component unmounted, which
        // would be a memory leak.
        if (isMounted) setBookmarks(list);
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    const unsubscribe = bookmarksService.subscribeToBookmarks((list) => {
      if (isMounted) setBookmarks(list);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  /**
   * Wraps a service call so every mutation shares the same behaviour:
   * run it, store the returned list, and let errors bubble to the caller
   * (the dialog shows them next to the form field).
   */
  const runMutation = useCallback(async (operation) => {
    setError(null);
    try {
      const next = await operation();
      setBookmarks(next);
      return next;
    } catch (mutationError) {
      setError(mutationError);
      throw mutationError; // let the form decide how to display it
    }
  }, []);

  const addBookmark = useCallback(
    (input) => runMutation(() => bookmarksService.createBookmark(input)),
    [runMutation],
  );

  const editBookmark = useCallback(
    (id, changes) => runMutation(() => bookmarksService.updateBookmark(id, changes)),
    [runMutation],
  );

  const removeBookmark = useCallback(
    (id) => runMutation(() => bookmarksService.deleteBookmark(id)),
    [runMutation],
  );

  return { bookmarks, isLoading, error, addBookmark, editBookmark, removeBookmark };
}
