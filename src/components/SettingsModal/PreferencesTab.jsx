/**
 * PreferencesTab
 * ---------------------------------------------------------------------------
 * Search engine and background photo settings — relocated from the old
 * `SettingsPopover.jsx` unchanged, just moved into its own tab.
 *
 * FAVORITES live here too: "My Favorites" is appended to the Background
 * select's own item list (only once signed in with at least one favorite)
 * rather than getting a separate control — `categoryId: 'favorites'` is a
 * sentinel `useBackground.js` understands, see its header comment. Picking
 * it reveals a second small select for shuffle-vs-fixed, and a "Manage
 * favorites" button (shown whenever signed in) opens `FavoritesGallery`,
 * whose open state lives right here since nothing outside this tab needs to
 * trigger it.
 */

import { useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { RefreshIcon } from '../ui/icons.jsx';
import { FavoritesGallery } from '../Favorites/FavoritesGallery.jsx';
import { SEARCH_ENGINES } from '../../services/searchEngines.js';
import { BACKGROUND_CATEGORIES } from '../../services/backgroundCategories.js';
import { isUnsplashConfigured } from '../../services/unsplashService.js';
import styles from './SettingsModal.module.css';

const FAVORITES_MODES = [
  { id: 'shuffle', name: 'Shuffle' },
  { id: 'fixed', name: 'Always show one' },
];

/**
 * @param {object} props
 * @param {{engineId: string, categoryId: string, favoritesMode: string, pinnedFavoriteId: string|null}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 * @param {() => void} props.onNewPhoto  discards the cached photos and reloads
 * @param {object|null} props.user
 * @param {Photo[]} props.favorites
 * @param {(photoId: string) => void} props.removeFavorite
 */
export function PreferencesTab({ settings, onSettingsChange, onNewPhoto, user, favorites, removeFavorite }) {
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const backgroundItems =
    user && favorites.length > 0
      ? [...BACKGROUND_CATEGORIES, { id: 'favorites', name: 'My Favorites' }]
      : BACKGROUND_CATEGORIES;

  const isShowingFavorites = settings.categoryId === 'favorites';
  // "New photo" would be a visible no-op when pinned to one specific
  // favorite — nothing left for it to change.
  const isNewPhotoDisabled = isShowingFavorites && settings.favoritesMode === 'fixed';

  return (
    <div className={styles.section}>
      <Select
        label="Search engine"
        items={SEARCH_ENGINES}
        selectedKey={settings.engineId}
        onSelectionChange={(engineId) => onSettingsChange({ engineId })}
      />

      <Select
        label="Background"
        items={backgroundItems}
        selectedKey={settings.categoryId}
        onSelectionChange={(categoryId) => onSettingsChange({ categoryId })}
      />

      {isShowingFavorites && (
        <Select
          label="Favorites display"
          items={FAVORITES_MODES}
          selectedKey={settings.favoritesMode}
          onSelectionChange={(favoritesMode) => onSettingsChange({ favoritesMode })}
        />
      )}

      <Button className={styles.fullWidthButton} onPress={onNewPhoto} isDisabled={isNewPhotoDisabled}>
        <RefreshIcon size={16} />
        New photo
      </Button>

      {/* Shown whenever signed in, regardless of the current Background
          selection — you can build up a favorites list before ever
          switching to it. */}
      {user && (
        <Button className={styles.fullWidthButton} onPress={() => setIsGalleryOpen(true)}>
          Manage favorites ({favorites.length})
        </Button>
      )}

      {/* Only shown when there's no API key, so it reads as a hint the
          first time you run the app rather than permanent clutter. */}
      {!isUnsplashConfigured && (
        <p className={styles.hint}>
          Using the bundled gradients. Add an Unsplash key to <code>.env.local</code> for photo
          backgrounds — see the README.
        </p>
      )}

      <FavoritesGallery
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        favorites={favorites}
        settings={settings}
        onSettingsChange={onSettingsChange}
        removeFavorite={removeFavorite}
      />
    </div>
  );
}
