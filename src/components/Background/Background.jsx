/**
 * Background
 * ---------------------------------------------------------------------------
 * The full-bleed photo behind everything, plus the photographer credit
 * Unsplash requires.
 *
 * Two details worth noting:
 *
 *  1. The photo is a real <img> with `key={photo.id}`, not a CSS
 *     background-image. Changing the key makes React mount a *new* element,
 *     which restarts the fade-in animation on every new photo.
 *
 *  2. A gradient scrim sits between the photo and the UI. Without it, white
 *     text lands on a bright sky and becomes unreadable. It's darkest at the
 *     top and bottom, where the settings button and credit line live.
 */

import { PhotoCredit } from './PhotoCredit.jsx';
import { FavoriteButton } from './FavoriteButton.jsx';
import styles from './Background.module.css';

/**
 * @param {object} props
 * @param {Photo|null} props.photo  null while the first photo is loading
 * @param {object|null} props.user
 * @param {Photo[]} props.favorites
 * @param {(photo: Photo) => void} props.addFavorite
 * @param {(photoId: string) => void} props.removeFavorite
 * @param {() => void} props.onRequestSignIn
 */
export function Background({ photo, user, favorites, addFavorite, removeFavorite, onRequestSignIn }) {
  return (
    <div
      className={styles.background}
      // Unsplash gives us each photo's dominant colour. Showing it underneath
      // means the page is never plain black before the image appears.
      style={{ backgroundColor: photo?.color ?? '#14161c' }}
    >
      {photo && (
        <img
          key={photo.id}
          src={photo.imageUrl}
          alt=""
          /* The photo is decoration, not content: an empty alt plus
             aria-hidden keeps it out of the screen reader's way entirely. */
          aria-hidden="true"
          className={styles.image}
        />
      )}

      <div className={styles.scrim} />

      {photo && <PhotoCredit photo={photo} />}
      {photo && (
        <FavoriteButton
          photo={photo}
          user={user}
          favorites={favorites}
          addFavorite={addFavorite}
          removeFavorite={removeFavorite}
          onRequestSignIn={onRequestSignIn}
        />
      )}
    </div>
  );
}
