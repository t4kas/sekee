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
import { PhotoCredit } from './components/Background/PhotoCredit.jsx';
import { FavoriteButton } from './components/Background/FavoriteButton.jsx';
import { AuthDialog } from './components/Account/AuthDialog.jsx';
import { Preloader } from './components/Preloader/Preloader.jsx';
import { SettingsIcon } from './components/ui/icons.jsx';
import { Tooltip } from './components/ui/Tooltip.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useSync } from './hooks/useSync.js';
import { useFileProvider } from './hooks/useFileProvider.js';
import { useBookmarks } from './hooks/useBookmarks.js';
import { useBookmarkGroups } from './hooks/useBookmarkGroups.js';
import { useFavorites } from './hooks/useFavorites.js';
import { useSettings } from './hooks/useSettings.js';
import { useBackground } from './hooks/useBackground.js';
import { useBackgroundTone } from './hooks/useBackgroundTone.js';
import { clearPhotoCache } from './services/unsplashService.js';
import { exportBookmarksToHtml, parseBookmarksHtml } from './services/bookmarkImportExport.js';
import styles from './App.module.css';

export default function App() {
  // `useAuth` is called exactly once, here — see its header comment for why
  // that matters. `user`/`signOut`/`signIn`/`signUp` flow down as props to
  // whatever needs them instead of each calling the hook itself.
  const { user, isLoading: isCheckingSession, signOut, signIn, signUp } = useAuth();
  // `useSync` points `storage` at the account when signed in and at this
  // device otherwise. Called exactly once here for the same reason `useAuth`
  // is; see its header. Everything below stays unaware of which one won.
  const sync = useSync(user);
  // The user's own cloud storage for images and attachments — a separate
  // question from where bookmarks sync, and deliberately not tied to it. Also
  // called exactly once here; see the hook's header.
  const files = useFileProvider();
  const { settings, isLoading: isLoadingSettings, updateSettings, refresh: refreshSettings } = useSettings();
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
  const { favorites, addFavorite, removeFavorite } = useFavorites(sync.accountKey);
  const { photo, isLoading: isLoadingBackground, refresh: refreshBackground } = useBackground(settings, favorites);
  /** `'light'` when the photo behind the UI is bright enough that white text
   *  on white glass would stop being readable. It's stamped onto `.app`
   *  below, where the `[data-bg-tone='light']` block in tokens.css picks it
   *  up and inverts the palette for everything inside — the search bar, the
   *  weather widget, the group tabs, the bookmark tiles, the header controls
   *  and the credit line all recolour together because they're all built from
   *  those tokens. Dialogs and popovers are portalled outside this wrapper
   *  and deliberately don't follow; see the block's own comment. */
  const backgroundTone = useBackgroundTone(photo);

  /** Covers the app until every piece an *account* needs has settled, not
   *  just until `useAuth` knows whether one exists. Signed out, `sync.isReady`
   *  flips true almost immediately (pointing `storage` at localStorage is
   *  effectively synchronous) so this resolves as fast as it always did.
   *  Signed in, it stays true until `useSync` has disposed the old adapter,
   *  migrated local data, and pointed `storage` at the account — and, because
   *  `setActiveAdapter` re-delivers a fresh read to every subscriber before
   *  that promise resolves (see storage.js), `bookmarks`/`groups`/`settings`
   *  already hold the account's data by the time `sync.isReady` does. The
   *  remaining `isLoading*` checks only matter for the very first mount and
   *  for `useBackground`, which reacts to `settings` rather than to sync
   *  directly — without waiting for it too, the account's background photo
   *  would still swap in after the cover lifts. See Preloader.jsx. */
  const isPreparingAccount = Boolean(user) && !sync.isReady;
  const showPreloader =
    isCheckingSession ||
    isPreparingAccount ||
    (Boolean(user) && (isLoading || isLoadingGroups || isLoadingSettings || isLoadingBackground));

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

  /** Builds and downloads a Netscape Bookmark File — see
   *  `bookmarkImportExport.js`'s header for why that's the one format every
   *  major browser both reads and writes. Lives here rather than in a
   *  service or hook because triggering a browser download (a Blob URL + a
   *  synthetic click) is a DOM action, the same boundary `storage.js` draws
   *  around localStorage — components/App own browser APIs, services own
   *  data. */
  function handleExportBookmarks() {
    const html = exportBookmarksToHtml(groups, bookmarks);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bookmarks.html';
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Reads an uploaded Netscape Bookmark File and adds everything in it.
   * Needs both `groups` and `bookmarks` state together (matching a parsed
   * folder to an existing group by name, or creating a new one; appending
   * each bookmark into whichever group that resolved to), which is why this
   * lives here rather than inside either individual hook — same reasoning as
   * `refreshBookmarksAndGroups` above.
   *
   * One bookmark at a time, awaited in sequence rather than in parallel:
   * `createBookmark` in `bookmarksService.js` reads the full list, appends,
   * and writes it back, so concurrent calls would race and could silently
   * drop entries. A bad URL fails `normaliseUrl` and is just skipped, not
   * fatal to the rest of the import.
   *
   * @param {File} file
   * @returns {Promise<{imported: number, skipped: number, groupsCreated: number}>}
   */
  async function handleImportBookmarks(file) {
    const text = await file.text();
    const entries = parseBookmarksHtml(text);

    const groupIdByName = new Map(groups.map((group) => [group.name.toLowerCase(), group.id]));
    let groupsCreated = 0;
    let imported = 0;
    let skipped = 0;

    for (const entry of entries) {
      let groupId = activeGroupId;
      if (entry.folder) {
        const key = entry.folder.toLowerCase();
        groupId = groupIdByName.get(key);
        if (!groupId) {
          const updatedGroups = await createGroup(entry.folder);
          groupId = updatedGroups[updatedGroups.length - 1].id;
          groupIdByName.set(key, groupId);
          groupsCreated++;
        }
      }

      try {
        await addBookmark({ title: entry.title, url: entry.url, groupId });
        imported++;
      } catch {
        skipped++; // not a valid http(s) URL — see bookmarksService.js's normaliseUrl
      }
    }

    return { imported, skipped, groupsCreated };
  }

  return (
    <>
      {/* Covers everything below until the app is actually ready to show —
          see `isPreparingAccount`/`showPreloader` above and Preloader.jsx.
          The app underneath keeps rendering (and its hooks keep loading)
          rather than being swapped in afterwards, so the page is already
          warm when the cover comes off. */}
      {showPreloader && <Preloader message={isPreparingAccount ? 'Preparing your account…' : undefined} />}

      <Background photo={photo} tone={backgroundTone} />

      <div className={styles.app} data-bg-tone={backgroundTone}>
        <header className={styles.header}>
          <AccountControl user={user} signOut={signOut} onRequestSignIn={() => setIsAuthDialogOpen(true)} />
          <Tooltip label="Settings" placement="left">
            <AriaButton
              className={styles.settingsTrigger}
              aria-label="Settings"
              onPress={() => setIsSettingsOpen(true)}
            >
              <SettingsIcon size={18} />
            </AriaButton>
          </Tooltip>
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

        {/* The photographer credit Unsplash requires, plus the favourite
            toggle. These used to hang off `Background`, which is fixed, so
            they stayed put but floated *over* a dashboard long enough to
            scroll. As a real footer they hold the bottom edge and take up
            their own space, so nothing ends up underneath them. */}
        {photo && (
          <footer className={styles.footer}>
            <PhotoCredit photo={photo} />
            <FavoriteButton
              photo={photo}
              hasAccount={sync.isSignedIn}
              favorites={favorites}
              addFavorite={addFavorite}
              removeFavorite={removeFavorite}
              onRequestSignIn={() => setIsAuthDialogOpen(true)}
            />
          </footer>
        )}
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
        sync={sync}
        files={files}
        refreshBookmarks={refreshBookmarksAndGroups}
        refreshSettings={refreshSettings}
        groups={groups}
        onCreateGroup={createGroup}
        onRenameGroup={renameGroup}
        onDeleteGroup={deleteGroup}
        onReorderGroups={reorderGroups}
        onExportBookmarks={handleExportBookmarks}
        onImportBookmarks={handleImportBookmarks}
      />
    </>
  );
}
