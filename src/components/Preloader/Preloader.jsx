/**
 * Preloader
 * ---------------------------------------------------------------------------
 * The full-screen cover shown while `useAuth` works out whether there's an
 * existing session. That check is a network round-trip, and until it settles
 * the app can't know which storage adapter it's reading from — so rendering
 * the dashboard underneath would flash local bookmarks for a moment and then
 * swap them for the signed-in user's. This holds the screen instead.
 *
 * It deliberately does *not* wait for `useBackground`: the real photo may be
 * an Unsplash request away, so the cover uses one of the bundled gradients
 * (the same assets `unsplashService` falls back to) blurred behind the mark.
 * Blurring it keeps this visually distinct from the loaded page, so the
 * moment the app appears reads as an arrival rather than a photo swapping.
 *
 * `role="status"` rather than a live region on the spinner itself: the
 * spinner is decoration, and the announcement should be the sentence, once.
 */

import defaultBackground from '../../assets/backgrounds/dusk.svg';
import styles from './Preloader.module.css';

export function Preloader() {
  return (
    <div className={styles.preloader} role="status">
      {/* Decoration, like `Background`'s photo — empty alt plus aria-hidden
          keeps it out of the accessibility tree entirely. */}
      <img src={defaultBackground} alt="" aria-hidden="true" className={styles.backdrop} />
      <div className={styles.scrim} />

      <div className={styles.mark}>
        <h1 className={styles.heading}>Sekee</h1>
        <div className={styles.spinner} aria-hidden="true" />
        <span className="visually-hidden">Checking your account…</span>
      </div>
    </div>
  );
}
