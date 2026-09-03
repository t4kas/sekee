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
  // Bumped by `refresh()` to force the load effect below to re-run — see its
  // own comment for why the Settings modal's "Sync now" button needs this.
  const [refreshCount, setRefreshCount] = useState(0);

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
  }, [refreshCount]);

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

  /** After a drag-and-drop reorder within one group — goes through
   *  `runMutation` like any other edit, so a failed write (e.g. a signed-in
   *  write that Supabase rejects) surfaces the same way and the grid can
   *  fall back to the last-known order instead of showing a lie. */
  const reorderBookmarks = useCallback(
    (orderedIds) => runMutation(() => bookmarksService.reorderBookmarks(orderedIds)),
    [runMutation],
  );

  /** Moves every bookmark out of one group into another — used by
   *  `useBookmarkGroups.js` right before it deletes a group. Routed through
   *  `runMutation` like any other edit, so this hook's own `bookmarks` state
   *  reflects the move immediately (the write itself doesn't trigger this
   *  same tab's storage subscription — only other tabs'). */
  const reassignGroup = useCallback(
    (fromGroupId, toGroupId) => runMutation(() => bookmarksService.reassignGroup(fromGroupId, toGroupId)),
    [runMutation],
  );

  /** Fire-and-forget, deliberately NOT routed through `runMutation`: this
   *  fires as the user is already navigating away (see
   *  `bookmarksService.recordBookmarkOpened`'s comment), so there's no form
   *  around to show an error next to, and no reason to block on it. */
  const recordOpened = useCallback((id) => {
    bookmarksService
      .recordBookmarkOpened(id)
      .then(setBookmarks)
      .catch(() => {});
  }, []);

  /** Re-reads bookmarks from whichever adapter is active right now. The
   *  subscription above already catches changes written through this same
   *  browser, but sync is refresh-based (see `useAuth.js`) — this is what
   *  the Settings modal's "Sync now" button calls to pull down whatever
   *  changed on another device since the last load. */
  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  return {
    bookmarks,
    isLoading,
    error,
    addBookmark,
    editBookmark,
    removeBookmark,
    reorderBookmarks,
    reassignGroup,
    recordOpened,
    refresh,
  };
}
