/**
 * Preloader
 * ---------------------------------------------------------------------------
 * The full-screen cover shown until the app actually has something correct
 * to display — see `App.jsx`'s `showPreloader`. Signed out, that's just
 * `useAuth` settling. Signed in, it also spans `useSync` pointing `storage`
 * at the account and `bookmarks`/`groups`/`settings`/`background` loading
 * through it, so the dashboard is never shown once as the signed-out/local
 * state and then swapped for the account's — this covers the whole sequence
 * instead of a fraction of it.
 *
 * It deliberately does *not* wait for the account's real background photo:
 * that's an Unsplash (or cache) request `App.jsx` already factors into
 * `showPreloader`, but the cover itself uses one of the bundled gradients
 * (the same assets `unsplashService` falls back to) blurred behind the mark
 * regardless of whose account is loading. Blurring it keeps this visually
 * distinct from the loaded page, so the moment the app appears reads as an
 * arrival rather than a photo swapping.
 *
 * `role="status"` rather than a live region on the spinner itself: the
 * spinner is decoration, and the announcement should be the sentence, once.
 *
 * @param {object} [props]
 * @param {string} [props.message] shown under the spinner and announced to
 *   screen readers. Defaults to a generic "checking" message; `App.jsx`
 *   passes "Preparing your account…" once it knows there's a session to
 *   load.
 */

import defaultBackground from '../../assets/backgrounds/dusk.svg';
import styles from './Preloader.module.css';

export function Preloader({ message = 'Checking your account…' }) {
  return (
    <div className={styles.preloader} role="status">
      {/* Decoration, like `Background`'s photo — empty alt plus aria-hidden
          keeps it out of the accessibility tree entirely. */}
      <img src={defaultBackground} alt="" aria-hidden="true" className={styles.backdrop} />
      <div className={styles.scrim} />

      <div className={styles.mark}>
        <h1 className={styles.heading}>Sekee</h1>
        <div className={styles.spinner} aria-hidden="true" />
        <span className={styles.message}>{message}</span>
      </div>
    </div>
  );
}
