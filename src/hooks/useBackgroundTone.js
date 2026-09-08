/**
 * useBackgroundTone
 * ---------------------------------------------------------------------------
 * Reports whether the current background photo is `'light'` or `'dark'`, so
 * App can flip the palette (see the `[data-bg-tone='light']` block in
 * tokens.css) before the UI ends up as white text on a bright sky.
 *
 * Two-stage on purpose, because one of the two answers is instant and the
 * other is correct:
 *
 *  1. `photo.color` — Unsplash's dominant colour, already in hand the moment
 *     the photo is chosen. Applied synchronously during render, so the first
 *     paint of a new photo is already in the right palette.
 *  2. The averaged pixels, which need a (tiny) network round-trip. When they
 *     disagree with the dominant colour — a photo of a dark subject against a
 *     white studio wall is the classic case — this is the one that's right,
 *     so it replaces the guess.
 *
 * Stage 2 resolving to null (blocked request, tainted canvas — see
 * `measurePhotoLuminance`) simply leaves stage 1's answer standing.
 *
 * The tone is derived from `photo` rather than stored, so it can never go
 * stale against the photo actually on screen; the async result is keyed to
 * the photo id it was measured for and dropped if the photo has since
 * changed.
 */

import { useEffect, useState } from 'react';
import {
  DEFAULT_TONE,
  luminanceFromHex,
  measurePhotoLuminance,
  toneFromLuminance,
} from '../services/backgroundTone.js';

/**
 * @param {Photo|null} photo
 * @returns {'light'|'dark'}
 */
export function useBackgroundTone(photo) {
  // Keyed by photo id so a stale measurement can't be read against a photo it
  // wasn't taken from — the id is compared below before this is trusted.
  const [measured, setMeasured] = useState(null);

  useEffect(() => {
    if (!photo) return;

    let isMounted = true;
    measurePhotoLuminance(photo).then((luminance) => {
      if (!isMounted || luminance === null) return;
      setMeasured({ photoId: photo.id, luminance });
    });

    return () => {
      isMounted = false;
    };
  }, [photo?.id, photo?.imageUrl]);

  if (!photo) return DEFAULT_TONE;
  if (measured?.photoId === photo.id) return toneFromLuminance(measured.luminance);
  return toneFromLuminance(luminanceFromHex(photo.color));
}
