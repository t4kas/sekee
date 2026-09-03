/**
 * FavoritesGallery
 * ---------------------------------------------------------------------------
 * "Manage favorites" — a modal grid of every favorited photo, opened from
 * the Settings modal's Preferences tab. Two jobs in one dialog rather than
 * two separate UIs:
 *
 *  1. Browse/remove: every thumbnail has a remove button.
 *  2. Pick one to always show: when `settings.favoritesMode === 'fixed'`,
 *     clicking a thumbnail (not its remove button) pins it — the currently
 *     pinned one gets an accent ring. Clicking is inert for pinning while
 *     in "Shuffle" mode; removing still works either way.
 *
 * Reuses `BookmarkDialog.module.css`'s overlay/modal/dialog/heading chrome,
 * same as `AuthDialog`/`ConfirmDialog` — every modal in this app should
 * look identical.
 */

import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { TrashIcon } from '../ui/icons.jsx';
import dialogStyles from '../BookmarkDialog/BookmarkDialog.module.css';
import styles from './FavoritesGallery.module.css';

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {Photo[]} props.favorites
 * @param {{favoritesMode: string, pinnedFavoriteId: string|null}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 * @param {(photoId: string) => void} props.removeFavorite
 */
export function FavoritesGallery({ isOpen, onClose, favorites, settings, onSettingsChange, removeFavorite }) {
  const isPinning = settings.favoritesMode === 'fixed';

  return (
    <ModalOverlay
      className={dialogStyles.overlay}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
    >
      <Modal className={dialogStyles.modal}>
        <Dialog className={dialogStyles.dialog}>
          <Heading slot="title" className={dialogStyles.heading}>
            Favorites
          </Heading>

          {favorites.length === 0 ? (
            <p className={styles.empty}>
              No favorites yet — click the heart on a background to save it.
            </p>
          ) : (
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

                    <AriaButton
                      className={styles.remove}
                      aria-label={`Remove ${photo.altText || 'favorite'}`}
                      onPress={() => removeFavorite(photo.id).catch(() => {})}
                    >
                      <TrashIcon size={14} />
                    </AriaButton>
                  </div>
                );
              })}
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
