/**
 * FavoritesGrid
 * ---------------------------------------------------------------------------
 * The grid of every favorited photo — inline content for the Personalisation
 * tab's "Favorites" sub-tab (see `SettingsModal/PersonalisationTab.jsx`), not
 * a modal of its own. Two jobs in one view rather than two separate UIs:
 *
 *  1. Browse/remove: every thumbnail has a remove button.
 *  2. Pick one to always show: when `settings.favoritesMode === 'fixed'`,
 *     clicking a thumbnail (not its remove button) pins it — the currently
 *     pinned one gets an accent ring. Clicking is inert for pinning while
 *     in "Shuffle" mode; removing still works either way.
 */

import { Button as AriaButton } from 'react-aria-components';
import { TrashIcon } from '../ui/icons.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import styles from './FavoritesGrid.module.css';

/**
 * @param {object} props
 * @param {Photo[]} props.favorites
 * @param {{favoritesMode: string, pinnedFavoriteId: string|null}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 * @param {(photoId: string) => void} props.removeFavorite
 */
export function FavoritesGrid({ favorites, settings, onSettingsChange, removeFavorite }) {
  const isPinning = settings.favoritesMode === 'fixed';

  if (favorites.length === 0) {
    return <p className={styles.empty}>No favorites yet — click the heart on a background to save it.</p>;
  }

  return (
    <div className={styles.grid}>
      {favorites.map((photo) => {
        const isPinned = isPinning && settings.pinnedFavoriteId === photo.id;

        return (
          <div key={photo.id} className={styles.tile}>
            <button
              type="button"
              className={[styles.thumb, isPinned && styles.pinned].filter(Boolean).join(' ')}
              style={{ backgroundColor: photo.color }}
              disabled={!isPinning}
              onClick={() => onSettingsChange({ pinnedFavoriteId: photo.id })}
              aria-pressed={isPinning ? isPinned : undefined}
              title={isPinning ? 'Always show this photo' : undefined}
            >
              <img src={photo.imageUrl} alt={photo.altText} className={styles.image} />
            </button>

            <Tooltip label="Remove">
              <AriaButton
                className={styles.remove}
                aria-label={`Remove ${photo.altText || 'favorite'}`}
                onPress={() => removeFavorite(photo.id).catch(() => {})}
              >
                <TrashIcon size={14} />
              </AriaButton>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
