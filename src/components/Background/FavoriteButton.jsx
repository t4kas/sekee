/**
 * FavoriteButton
 * ---------------------------------------------------------------------------
 * The heart in the bottom-right corner of the background photo. Always
 * shown on a real (non-fallback) photo, signed in or not — signed out,
 * pressing it opens the sign-in dialog instead of favoriting, so the button
 * stays a discoverable way *into* the feature rather than disappearing
 * until you already have an account.
 *
 * Renders nothing for the bundled gradient fallbacks (`photo.isFallback`):
 * they're not anyone's photograph, and everyone already gets them, so
 * there's nothing meaningful to favorite.
 */

import { Button as AriaButton } from 'react-aria-components';
import { HeartIcon } from '../ui/icons.jsx';
import styles from './FavoriteButton.module.css';

/**
 * @param {object} props
 * @param {Photo|null} props.photo
 * @param {object|null} props.user
 * @param {Photo[]} props.favorites
 * @param {(photo: Photo) => void} props.addFavorite
 * @param {(photoId: string) => void} props.removeFavorite
 * @param {() => void} props.onRequestSignIn
 */
export function FavoriteButton({ photo, user, favorites, addFavorite, removeFavorite, onRequestSignIn }) {
  if (!photo || photo.isFallback) return null;

  const isFavorited = favorites.some((favorite) => favorite.id === photo.id);

  function handlePress() {
    if (!user) {
      onRequestSignIn();
      return;
    }

    // Fire-and-forget: a failed toggle isn't worth a loading/error state on
    // this small a control. `useFavorites` still records the error for
    // anyone who wants it later; this just stops it from also logging as an
    // unhandled rejection.
    const mutation = isFavorited ? removeFavorite(photo.id) : addFavorite(photo);
    mutation.catch(() => {});
  }

  return (
    <AriaButton
      className={styles.button}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={isFavorited}
      onPress={handlePress}
    >
      <HeartIcon size={18} filled={isFavorited} />
    </AriaButton>
  );
}
