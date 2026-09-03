/**
 * Favicon
 * ---------------------------------------------------------------------------
 * A bookmark's site icon, with a graceful fallback.
 *
 * Favicon services fail regularly — a site is new, blocks the fetcher, or
 * simply has no icon. Rather than showing a broken-image glyph, we catch the
 * <img>'s `error` event and swap in a coloured tile with the site's initial.
 */

import { useEffect, useState } from 'react';
import { getFaviconUrl } from '../../services/favicons.js';
import styles from './Favicon.module.css';

/** Derives a stable colour from the URL so each site's letter tile keeps the
 *  same hue between reloads (instead of flickering to a random colour). */
function hueFromString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

/** @param {{ url: string, title: string }} props */
export function Favicon({ url, title }) {
  const src = getFaviconUrl(url, 64);
  const [hasFailed, setHasFailed] = useState(false);

  // If the bookmark is edited to point at a different site, retry the icon.
  useEffect(() => {
    setHasFailed(false);
  }, [src]);

  if (!src || hasFailed) {
    const hue = hueFromString(url);
    return (
      <span
        className={styles.fallback}
        style={{ background: `hsl(${hue} 55% 42%)` }}
        aria-hidden="true"
      >
        {title.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }

  return (
    <img
      className={styles.icon}
      src={src}
      /* The tile's title text already names the site, so the icon is
         decorative and an empty alt keeps it from being read twice. */
      alt=""
      width="32"
      height="32"
      loading="lazy"
      onError={() => setHasFailed(true)}
    />
  );
}
