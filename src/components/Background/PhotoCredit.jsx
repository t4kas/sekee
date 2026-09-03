/**
 * PhotoCredit
 * ---------------------------------------------------------------------------
 * The photographer credit in the bottom-left corner.
 *
 * This is NOT optional decoration — Unsplash's API guidelines require that
 * whenever you display a photo you credit the photographer with a link to
 * their profile and link back to Unsplash, both carrying UTM parameters
 * identifying your app. `unsplashService.js` builds those URLs; this
 * component just renders them.
 *
 * Renders nothing for the bundled gradient fallbacks, which aren't anyone's
 * photographs.
 */

import { CameraIcon } from '../ui/icons.jsx';
import styles from './PhotoCredit.module.css';

/** @param {{ photo: Photo }} props */
export function PhotoCredit({ photo }) {
  if (photo.isFallback) return null;

  return (
    <p className={styles.credit}>
      <CameraIcon size={14} />
      <span>
        Photo by{' '}
        <a
          className={styles.link}
          href={photo.photographerUrl}
          target="_blank"
          /* noreferrer/noopener: standard hygiene for target="_blank" links. */
          rel="noreferrer noopener"
        >
          {photo.photographerName}
        </a>{' '}
        on{' '}
        <a
          className={styles.link}
          href={photo.unsplashUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Unsplash
        </a>
      </span>
    </p>
  );
}
