/**
 * PersonalisationTab
 * ---------------------------------------------------------------------------
 * Everything about the background photo: category, favorites display mode,
 * "New photo", and — as its own sub-tab rather than a separate modal like it
 * used to be — the favorites gallery itself.
 *
 * SUB-TABS: a second, smaller `Tabs` nested inside this tab's panel (see
 * `SettingsModal.jsx`'s own top-level `Tabs` for the sidebar). Nesting React
 * Aria `Tabs` instances is fine — each manages its own selection state
 * independently, the same way a modal can open on top of another (see
 * `AuthDialog`'s use from `AccountTab`).
 *
 * FAVORITES: "My Favorites" is appended to the Background select's own item
 * list (only once signed in with at least one favorite) rather than getting
 * a separate control — `categoryId: 'favorites'` is a sentinel
 * `useBackground.js` understands, see its header comment. Picking it reveals
 * a second small select for shuffle-vs-fixed. The Favorites sub-tab always
 * exists (switching to it doesn't depend on `categoryId`), so you can build
 * up or manage a list before ever actually switching the background to it.
 *
 * UPLOADS: the same shape again, one sentinel along — "My Uploads" joins the
 * Background select once there's at least one, and the Uploads sub-tab (see
 * `CustomBackgrounds.jsx`) is always there to add the first. The images go
 * to the user's own Drive or Dropbox rather than to this app, which is why
 * that sub-tab, not this one, is where the "connect storage first" case is
 * handled.
 */

import { useState } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { RefreshIcon } from '../ui/icons.jsx';
import { FavoritesGrid } from '../Favorites/FavoritesGrid.jsx';
import { CustomBackgrounds } from '../CustomBackgrounds/CustomBackgrounds.jsx';
import { BACKGROUND_CATEGORIES } from '../../services/backgroundCategories.js';
import { isUnsplashConfigured } from '../../services/unsplashService.js';
import styles from './SettingsModal.module.css';

const FAVORITES_MODES = [
  { id: 'shuffle', name: 'Shuffle' },
  { id: 'fixed', name: 'Always show one' },
];

/**
 * @param {object} props
 * @param {{categoryId: string, favoritesMode: string, pinnedFavoriteId: string|null}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 * @param {() => void} props.onNewPhoto  discards the cached photos and reloads
 * @param {object|null} props.user
 * @param {Photo[]} props.favorites
 * @param {(photoId: string) => void} props.removeFavorite
 * @param {object} props.custom the `useCustomBackgrounds` result — see App.jsx
 * @param {object} props.files the `useFileProvider` result — see App.jsx
 */
export function PersonalisationTab({
  settings,
  onSettingsChange,
  onNewPhoto,
  user,
  favorites,
  removeFavorite,
  custom,
  files,
}) {
  const [subTab, setSubTab] = useState('background');

  const backgroundItems = [
    ...BACKGROUND_CATEGORIES,
    ...(user && favorites.length > 0 ? [{ id: 'favorites', name: 'My Favorites' }] : []),
    ...(custom.backgrounds.length > 0 ? [{ id: 'custom', name: 'My Uploads' }] : []),
  ];

  const isShowingFavorites = settings.categoryId === 'favorites';
  // "New photo" would be a visible no-op when pinned to one specific
  // favorite or upload — nothing left for it to change.
  const isNewPhotoDisabled =
    (isShowingFavorites && settings.favoritesMode === 'fixed') ||
    (settings.categoryId === 'custom' && Boolean(settings.customBackgroundId));

  const connectedProvider = files.available.find((provider) => provider.id === files.providerId);

  return (
    <Tabs className={styles.section} selectedKey={subTab} onSelectionChange={setSubTab}>
      <TabList className={styles.subTabList} aria-label="Personalisation sections">
        <Tab id="background" className={styles.subTabButton}>
          Background
        </Tab>
        <Tab id="favorites" className={styles.subTabButton}>
          Favorites{favorites.length > 0 ? ` (${favorites.length})` : ''}
        </Tab>
        <Tab id="uploads" className={styles.subTabButton}>
          Uploads{custom.backgrounds.length > 0 ? ` (${custom.backgrounds.length})` : ''}
        </Tab>
      </TabList>

      <TabPanel id="background" className={styles.section}>
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

        {/* Only shown when there's no API key, so it reads as a hint the
            first time you run the app rather than permanent clutter. */}
        {!isUnsplashConfigured && (
          <p className={styles.hint}>
            Using the bundled gradients. Add an Unsplash key to <code>.env.local</code> for photo
            backgrounds — see the README.
          </p>
        )}
      </TabPanel>

      <TabPanel id="favorites" className={styles.section}>
        {user ? (
          <FavoritesGrid
            favorites={favorites}
            settings={settings}
            onSettingsChange={onSettingsChange}
            removeFavorite={removeFavorite}
          />
        ) : (
          <p className={styles.hint}>
            Favoriting a background photo requires an account — sign in from the Account tab, then
            click the heart on any photo to save it here.
          </p>
        )}
      </TabPanel>

      <TabPanel id="uploads" className={styles.section}>
        <CustomBackgrounds
          settings={settings}
          onSettingsChange={onSettingsChange}
          custom={custom}
          connectedProviderId={files.providerId}
          storageLabel={connectedProvider?.label ?? null}
        />
      </TabPanel>
    </Tabs>
  );
}
