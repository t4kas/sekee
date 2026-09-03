/**
 * App
 * ---------------------------------------------------------------------------
 * The layout shell. It owns which dialog is open and wires the hooks to the
 * components — deliberately thin, with no storage or fetching logic of its
 * own. Everything it needs comes from the hooks below.
 *
 * Layout, from back to front:
 *   Background   fixed, full-bleed photo + scrim + photographer credit
 *   .content     the centred column: weather widget, search bar, then bookmarks
 *   overlays     settings popover (top-right), dialogs (centred)
 */

import { useState } from 'react';
import { Background } from './components/Background/Background.jsx';
import { WeatherWidget } from './components/WeatherWidget/WeatherWidget.jsx';
import { SearchBar } from './components/SearchBar/SearchBar.jsx';
import { BookmarkGrid } from './components/BookmarkGrid/BookmarkGrid.jsx';
import { BookmarkDialog } from './components/BookmarkDialog/BookmarkDialog.jsx';
import { ConfirmDialog } from './components/BookmarkDialog/ConfirmDialog.jsx';
import { SettingsPopover } from './components/SettingsPopover/SettingsPopover.jsx';
import { AccountControl } from './components/Account/AccountControl.jsx';
import { AuthDialog } from './components/Account/AuthDialog.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useBookmarks } from './hooks/useBookmarks.js';
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
  const { settings, updateSettings } = useSettings();
  const { bookmarks, isLoading, addBookmark, editBookmark, removeBookmark } = useBookmarks();
  // Favorites need to exist before useBackground can decide whether to show
  // one — see useBackground.js.
  const { favorites, addFavorite, removeFavorite } = useFavorites(user?.id);
  const { photo, refresh: refreshBackground } = useBackground(settings, favorites);

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
          <SettingsPopover
            settings={settings}
            onSettingsChange={updateSettings}
            onNewPhoto={handleNewPhoto}
            user={user}
            favorites={favorites}
            removeFavorite={removeFavorite}
          />
        </header>

        <main className={styles.content}>
          <WeatherWidget location={settings.weatherLocation} units={settings.weatherUnits} />
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

      <AuthDialog
        isOpen={isAuthDialogOpen}
        onClose={() => setIsAuthDialogOpen(false)}
        signIn={signIn}
        signUp={signUp}
      />
    </>
  );
}
