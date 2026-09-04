/**
 * App
 * ---------------------------------------------------------------------------
 * The layout shell. It owns which dialog is open and wires the hooks to the
 * components — deliberately thin, with no storage or fetching logic of its
 * own. Everything it needs comes from the hooks below.
 *
 * Layout, from back to front:
 *   Background   fixed, full-bleed photo + scrim + photographer credit
 *   .content     the centred column: weather widget, search bar, group tabs,
 *                then the active group's bookmarks
 *   overlays     settings modal (top-right), dialogs (centred)
 */

import { useMemo, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Background } from './components/Background/Background.jsx';
import { WeatherWidget } from './components/WeatherWidget/WeatherWidget.jsx';
import { SearchBar } from './components/SearchBar/SearchBar.jsx';
import { GroupTabs } from './components/BookmarkGrid/GroupTabs.jsx';
import { BookmarkGrid } from './components/BookmarkGrid/BookmarkGrid.jsx';
import { BookmarkDialog } from './components/BookmarkDialog/BookmarkDialog.jsx';
import { ConfirmDialog } from './components/BookmarkDialog/ConfirmDialog.jsx';
import { SettingsModal } from './components/SettingsModal/SettingsModal.jsx';
import { AccountControl } from './components/Account/AccountControl.jsx';
import { AuthDialog } from './components/Account/AuthDialog.jsx';
import { SettingsIcon } from './components/ui/icons.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useBookmarks } from './hooks/useBookmarks.js';
import { useBookmarkGroups } from './hooks/useBookmarkGroups.js';
import { useFavorites } from './hooks/useFavorites.js';
import { useSettings } from './hooks/useSettings.js';
import { useBackground } from './hooks/useBackground.js';
import { clearPhotoCache } from './services/unsplashService.js';
import styles from './App.module.css';

export default function App() {
  // `useAuth` is called exactly once, here — see its header comment for why
  // that matters. `user`/`signOut`/`signIn`/`signUp` flow down as props to
  // whatever needs them instead of each calling the hook itself.
  const { user, signOut, signIn, signUp } = useAuth();
  const { settings, updateSettings, refresh: refreshSettings } = useSettings();
  const {
    bookmarks,
    isLoading,
    addBookmark,
    editBookmark,
    removeBookmark,
    reorderBookmarks,
    reassignGroup,
    recordOpened,
    refresh: refreshBookmarks,
  } = useBookmarks();
  // Takes `reassignGroup` (from `useBookmarks` above) so deleting a group
  // moves its bookmarks into another one before removing it — see
  // useBookmarkGroups.js's header comment.
  const {
    groups,
    isLoading: isLoadingGroups,
    activeGroupId,
    setActiveGroupId,
    createGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
    refresh: refreshGroups,
  } = useBookmarkGroups(reassignGroup);
  // Favorites need to exist before useBackground can decide whether to show
  // one — see useBackground.js.
  const { favorites, addFavorite, removeFavorite } = useFavorites(user?.id);
  const { photo, refresh: refreshBackground } = useBackground(settings, favorites);

  /** The active group's bookmarks, in display order. `'recent'` mode derives
   *  its order from `lastOpenedAt` (never-opened bookmarks sort last, via
   *  the `?? 0` fallback) instead of the stored `order` field — see
   *  `settingsService.js`'s `bookmarkSortMode` comment for why this is one
   *  global setting rather than tracked per group. */
  const visibleBookmarks = useMemo(() => {
    const inActiveGroup = bookmarks.filter((bookmark) => bookmark.groupId === activeGroupId);
    if (settings.bookmarkSortMode === 'recent') {
      return [...inActiveGroup].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    }
    return [...inActiveGroup].sort((a, b) => a.order - b.order);
  }, [bookmarks, activeGroupId, settings.bookmarkSortMode]);

  // Which dialog is open, if any.
  //   null                       -> nothing open
  //   { mode: 'add' }            -> add form
  //   { mode: 'edit', bookmark } -> edit form, prefilled
  //   { mode: 'delete', bookmark } -> delete confirmation
  const [dialog, setDialog] = useState(null);

  // Separate from `dialog` above: the sign-in dialog has two unrelated
  // trigger points (the account button, and favoriting a photo while signed
  // out), so it isn't part of that single-selection state machine.
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  // The settings modal used to manage its own open/close state internally
  // (it was a `DialogTrigger`-based popover). Now that it's a full modal
  // rendered down with the others below, `App` owns this the same way it
  // owns every other dialog's open state.
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const closeDialog = () => setDialog(null);

  /** Called by BookmarkDialog for both add and edit. Errors thrown here
   *  (e.g. an invalid URL) propagate back to the form, which displays them. */
  async function handleSubmitBookmark(values) {
    if (dialog?.mode === 'edit') {
      await editBookmark(dialog.bookmark.id, values);
    } else {
      await addBookmark(values);
    }
  }

  /** Throws away the cached photo pools so the next fetch hits Unsplash. */
  async function handleNewPhoto() {
    await clearPhotoCache();
    refreshBackground();
  }

  /** Passed to the Settings modal's Sync tab as its single "Sync now"
   *  action — bookmarks and groups are two separate storage keys (and two
   *  separate hooks), but one button re-reads both. */
  function refreshBookmarksAndGroups() {
    refreshBookmarks();
    refreshGroups();
  }

  return (
    <>
      <Background
        photo={photo}
        user={user}
        favorites={favorites}
        addFavorite={addFavorite}
        removeFavorite={removeFavorite}
        onRequestSignIn={() => setIsAuthDialogOpen(true)}
      />

      <div className={styles.app}>
        <header className={styles.header}>
          <AccountControl user={user} signOut={signOut} onRequestSignIn={() => setIsAuthDialogOpen(true)} />
          <AriaButton
            className={styles.settingsTrigger}
            aria-label="Settings"
            onPress={() => setIsSettingsOpen(true)}
          >
            <SettingsIcon size={18} />
          </AriaButton>
        </header>

        <main className={styles.content}>
          <WeatherWidget location={settings.weatherLocation} units={settings.weatherUnits} />
          <SearchBar engineId={settings.engineId} />

          {!isLoadingGroups && (
            <GroupTabs
              groups={groups}
              activeGroupId={activeGroupId}
              onSelect={setActiveGroupId}
              onCreateGroup={createGroup}
              onRenameGroup={renameGroup}
              onDeleteGroup={deleteGroup}
            />
          )}

          <BookmarkGrid
            bookmarks={visibleBookmarks}
            isLoading={isLoading || isLoadingGroups}
            sortMode={settings.bookmarkSortMode}
            onAdd={() => setDialog({ mode: 'add' })}
            onEdit={(bookmark) => setDialog({ mode: 'edit', bookmark })}
            onDelete={(bookmark) => setDialog({ mode: 'delete', bookmark })}
            onOpen={recordOpened}
            onReorder={reorderBookmarks}
          />
        </main>
      </div>

      <BookmarkDialog
        isOpen={dialog?.mode === 'add' || dialog?.mode === 'edit'}
        bookmark={dialog?.mode === 'edit' ? dialog.bookmark : null}
        groups={groups}
        defaultGroupId={activeGroupId}
        onClose={closeDialog}
        onSubmit={handleSubmitBookmark}
      />

      <ConfirmDialog
        isOpen={dialog?.mode === 'delete'}
        title="Delete bookmark?"
        message={`"${dialog?.bookmark?.title ?? ''}" will be removed from your bookmarks.`}
        onConfirm={() => removeBookmark(dialog.bookmark.id)}
        onClose={closeDialog}
      />

      <AuthDialog
        isOpen={isAuthDialogOpen}
        onClose={() => setIsAuthDialogOpen(false)}
        signIn={signIn}
        signUp={signUp}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={updateSettings}
        onNewPhoto={handleNewPhoto}
        user={user}
        favorites={favorites}
        removeFavorite={removeFavorite}
        signIn={signIn}
        signUp={signUp}
        signOut={signOut}
        refreshBookmarks={refreshBookmarksAndGroups}
        refreshSettings={refreshSettings}
        groups={groups}
        onReorderGroups={reorderGroups}
      />
    </>
  );
}
