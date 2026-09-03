/**
 * SettingsPopover
 * ---------------------------------------------------------------------------
 * The gear button in the top-right corner and the panel it opens: search
 * engine, background category, and a button to pull a fresh photo.
 *
 * `DialogTrigger` is the piece doing the work here — it pairs a trigger button
 * with an overlay, handles the open/closed state, positions the popover
 * against the button (flipping it if it would run off-screen), moves focus in
 * and back out again, and closes on Escape or an outside click.
 *
 * It's a `Dialog` inside the `Popover` rather than bare content because the
 * panel holds interactive controls: that gives it the right role and makes
 * focus behave the way people expect.
 *
 * NESTING ORDER MATTERS: `TooltipTrigger` goes on the OUTSIDE, wrapping the
 * whole `DialogTrigger`. Both components hand props to the button through
 * context, and the inner one wins — so putting the tooltip inside would let
 * it swallow the props that connect the button to its popover.
 *
 * FAVORITES live here too: "My Favorites" is appended to the Background
 * select's own item list (only once signed in with at least one favorite)
 * rather than getting a separate control — `categoryId: 'favorites'` is a
 * sentinel `useBackground.js` understands, see its header comment. Picking
 * it reveals a second small select for shuffle-vs-fixed, and a "Manage
 * favorites" button (shown whenever signed in) opens `FavoritesGallery`,
 * whose open state lives right here since nothing outside this popover
 * needs to trigger it.
 */

import { useState } from 'react';
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Popover,
  Tooltip,
  TooltipTrigger,
} from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { TextField } from '../ui/TextField.jsx';
import { RefreshIcon, SettingsIcon } from '../ui/icons.jsx';
import { FavoritesGallery } from '../Favorites/FavoritesGallery.jsx';
import { SEARCH_ENGINES } from '../../services/searchEngines.js';
import { BACKGROUND_CATEGORIES } from '../../services/backgroundCategories.js';
import { isUnsplashConfigured } from '../../services/unsplashService.js';
import styles from './SettingsPopover.module.css';

const FAVORITES_MODES = [
  { id: 'shuffle', name: 'Shuffle' },
  { id: 'fixed', name: 'Always show one' },
];

const WEATHER_UNITS = [
  { id: 'fahrenheit', name: 'Fahrenheit (°F)' },
  { id: 'celsius', name: 'Celsius (°C)' },
];

/**
 * @param {object} props
 * @param {{engineId: string, categoryId: string, favoritesMode: string, pinnedFavoriteId: string|null, weatherLocation: string, weatherUnits: string}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 * @param {() => void} props.onNewPhoto  discards the cached photos and reloads
 * @param {object|null} props.user
 * @param {Photo[]} props.favorites
 * @param {(photoId: string) => void} props.removeFavorite
 */
export function SettingsPopover({
  settings,
  onSettingsChange,
  onNewPhoto,
  user,
  favorites,
  removeFavorite,
}) {
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
    <>
      {/* `delay` is the pause before the tooltip appears, so it stays out of
          the way of anyone who knows what a gear does. */}
      <TooltipTrigger delay={600} closeDelay={100}>
        <DialogTrigger>
          {/* React Aria's own Button, not our styled wrapper, so DialogTrigger
              can pass it the props that link it to the popover. */}
          <AriaButton className={styles.trigger} aria-label="Settings">
            <SettingsIcon size={18} />
          </AriaButton>

          {/* `bottom end` = below the button, right edges aligned. */}
          <Popover className={styles.popover} placement="bottom end" offset={8}>
            <Dialog className={styles.dialog} aria-label="Settings">
              <Select
                label="Search engine"
                items={SEARCH_ENGINES}
                selectedKey={settings.engineId}
                onSelectionChange={(engineId) => onSettingsChange({ engineId })}
              />

              <TextField
                label="Weather location"
                placeholder="e.g. Boston"
                value={settings.weatherLocation}
                onChange={(weatherLocation) => onSettingsChange({ weatherLocation })}
              />

              <Select
                label="Temperature units"
                items={WEATHER_UNITS}
                selectedKey={settings.weatherUnits}
                onSelectionChange={(weatherUnits) => onSettingsChange({ weatherUnits })}
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

              {/* Shown whenever signed in, regardless of the current
                  Background selection — you can build up a favorites list
                  before ever switching to it. */}
              {user && (
                <Button className={styles.fullWidthButton} onPress={() => setIsGalleryOpen(true)}>
                  Manage favorites ({favorites.length})
                </Button>
              )}

              {/* Only shown when there's no API key, so it reads as a hint
                  the first time you run the app rather than permanent
                  clutter. */}
              {!isUnsplashConfigured && (
                <p className={styles.hint}>
                  Using the bundled gradients. Add an Unsplash key to{' '}
                  <code>.env.local</code> for photo backgrounds — see the README.
                </p>
              )}
            </Dialog>
          </Popover>
        </DialogTrigger>

        <Tooltip className={styles.tooltip} placement="bottom" offset={8}>
          Settings
        </Tooltip>
      </TooltipTrigger>

      <FavoritesGallery
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        favorites={favorites}
        settings={settings}
        onSettingsChange={onSettingsChange}
        removeFavorite={removeFavorite}
      />
    </>
  );
}
