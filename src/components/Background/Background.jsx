/**
 * Background
 * ---------------------------------------------------------------------------
 * The full-bleed photo behind everything. Purely the backdrop: the credit
 * Unsplash requires and the favourite button used to hang off this element
 * too, but they now sit in App's sticky footer so they hold their place
 * against a dashboard tall enough to scroll, rather than floating over it.
 *
 * Two details worth noting:
 *
 *  1. The photo is a real <img> with `key={photo.id}`, not a CSS
 *     background-image. Changing the key makes React mount a *new* element,
 *     which restarts the fade-in animation on every new photo.
 *
 *  2. A gradient scrim sits between the photo and the UI. Without it, white
 *     text lands on a bright sky and becomes unreadable. It's strongest at the
 *     top and bottom, where the settings button and credit line live.
 *
 *     The scrim follows `tone` (from `useBackgroundTone`): over a light photo
 *     the UI's own palette has inverted to dark text on dark glass, so a black
 *     scrim would be working against it — it lightens the edges instead, for
 *     the same reason and in the same places.
 */

import styles from './Background.module.css';

/**
 * @param {object} props
 * @param {Photo|null} props.photo  null while the first photo is loading
 * @param {'light'|'dark'} [props.tone]  brightness of `photo` — see the header
 */
export function Background({ photo, tone = 'dark' }) {
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

      <div className={styles.scrim} data-tone={tone} />

    </div>
  );
}
