/**
 * useBookmarkGroups
 * ---------------------------------------------------------------------------
 * Groups (the tabs above the bookmark grid) plus which one is currently
 * active. Same load/subscribe shape as `useBookmarks.js`.
 *
 * `activeGroupId` lives here rather than in `App.jsx` because nothing
 * outside the bookmarks area needs it, and it isn't persisted — every load
 * starts on the first group by display order, rather than remembering the
 * last-viewed one, to keep this one less thing synced across devices.
 *
 * DELETING A GROUP calls `bookmarksService.reassignGroup` first (moving its
 * bookmarks into the group that'll end up first after the delete) and only
 * then removes the group itself, so a bookmark never points at a group that
 * no longer exists. That's why this hook takes `reassignGroup` as a
 * parameter rather than importing `bookmarksService` directly — it's the
 * one piece of bookmark-side logic groups need, and `App.jsx` already has a
 * `useBookmarks()` instance whose local state should reflect the move too.
 */

import { useCallback, useEffect, useState } from 'react';
import * as groupsService from '../services/bookmarkGroupsService.js';

/**
 * @param {(fromGroupId: string, toGroupId: string) => Promise<Array>} reassignGroup
 */
export function useBookmarkGroups(reassignGroup) {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    groupsService.listGroups().then((list) => {
      if (!isMounted) return;
      setGroups(list);
      setIsLoading(false);
      // Only picks a default the very first time — see `setActiveGroupId`
      // calls below for how a delete keeps this pointed at a real group.
      setActiveGroupId((current) => current ?? list[0]?.id ?? null);
    });

    const unsubscribe = groupsService.subscribeToGroups((list) => {
      if (isMounted) setGroups(list);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [refreshCount]);

  const createGroup = useCallback(async (name) => {
    const next = await groupsService.createGroup(name);
    setGroups(next);
    // The new group is always last by display order, so this is safe
    // without re-sorting.
    setActiveGroupId(next[next.length - 1].id);
    return next;
  }, []);

  const renameGroup = useCallback(async (id, name) => {
    const next = await groupsService.renameGroup(id, name);
    setGroups(next);
    return next;
  }, []);

  const deleteGroup = useCallback(
    async (id) => {
      const remaining = groups.filter((group) => group.id !== id).sort((a, b) => a.order - b.order);
      const fallbackGroupId = remaining[0]?.id;
      if (!fallbackGroupId) return; // refuse silently — see groupsService.deleteGroup

      await reassignGroup(id, fallbackGroupId);
      const next = await groupsService.deleteGroup(id);
      setGroups(next);
      setActiveGroupId((current) => (current === id ? fallbackGroupId : current));
      return next;
    },
    [groups, reassignGroup],
  );

  const reorderGroups = useCallback(async (orderedIds) => {
    const next = await groupsService.reorderGroups(orderedIds);
    setGroups(next);
    return next;
  }, []);

  /** Same reasoning as `useBookmarks.js`'s `refresh` — re-reads from
   *  whichever adapter is active, for the Sync tab's "Sync now" button. */
  const refresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  return {
    groups,
    isLoading,
    activeGroupId,
    setActiveGroupId,
    createGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
    refresh,
  };
}
