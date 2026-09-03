/**
 * App
 * ---------------------------------------------------------------------------
 * The layout shell. It owns which dialog is open and wires the hooks to the
 * components — deliberately thin, with no storage or fetching logic of its
 * own. Everything it needs comes from the three hooks below.
 *
 * Layout, from back to front:
 *   Background   fixed, full-bleed photo + scrim + photographer credit
 *   .content     the centred column: search bar, then bookmarks
 *   overlays     settings popover (top-right), dialogs (centred)
 */

import { useState } from 'react';
import { Background } from './components/Background/Background.jsx';
import { SearchBar } from './components/SearchBar/SearchBar.jsx';
import { BookmarkGrid } from './components/BookmarkGrid/BookmarkGrid.jsx';
import { BookmarkDialog } from './components/BookmarkDialog/BookmarkDialog.jsx';
import { ConfirmDialog } from './components/BookmarkDialog/ConfirmDialog.jsx';
import { SettingsPopover } from './components/SettingsPopover/SettingsPopover.jsx';
import { AccountControl } from './components/Account/AccountControl.jsx';
import { useBookmarks } from './hooks/useBookmarks.js';
import { useSettings } from './hooks/useSettings.js';
import { useBackground } from './hooks/useBackground.js';
import { clearPhotoCache } from './services/unsplashService.js';
import styles from './App.module.css';

export default function App() {
  const { settings, updateSettings } = useSettings();
  const { bookmarks, isLoading, addBookmark, editBookmark, removeBookmark } = useBookmarks();
  const { photo, refresh: refreshBackground } = useBackground(settings.categoryId);

  // Which dialog is open, if any.
  //   null                       -> nothing open
  //   { mode: 'add' }            -> add form
  //   { mode: 'edit', bookmark } -> edit form, prefilled
  //   { mode: 'delete', bookmark } -> delete confirmation
  const [dialog, setDialog] = useState(null);

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

  return (
    <>
      <Background photo={photo} />

      <div className={styles.app}>
        <header className={styles.header}>
          <AccountControl />
          <SettingsPopover
            settings={settings}
            onSettingsChange={updateSettings}
            onNewPhoto={handleNewPhoto}
          />
        </header>

        <main className={styles.content}>
          <SearchBar engineId={settings.engineId} />

          <BookmarkGrid
            bookmarks={bookmarks}
            isLoading={isLoading}
            onAdd={() => setDialog({ mode: 'add' })}
            onEdit={(bookmark) => setDialog({ mode: 'edit', bookmark })}
            onDelete={(bookmark) => setDialog({ mode: 'delete', bookmark })}
          />
        </main>
      </div>

      <BookmarkDialog
        isOpen={dialog?.mode === 'add' || dialog?.mode === 'edit'}
        bookmark={dialog?.mode === 'edit' ? dialog.bookmark : null}
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
    </>
  );
}
