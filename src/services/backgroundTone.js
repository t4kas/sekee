/**
 * backgroundTone
 * ---------------------------------------------------------------------------
 * Works out whether the photo behind the UI is light or dark, so the app can
 * swap its palette instead of putting white-on-white text over a snowfield.
 *
 * The whole UI is white text on translucent white glass (see tokens.css), a
 * palette that only works over a reasonably dark backdrop. Unsplash serves
 * plenty of photos that aren't — beaches, snow, fog, blown-out skies — and on
 * those the search bar, weather pill, group tabs and bookmark tiles all lose
 * their contrast at once. Rather than tuning the scrim darker for everyone
 * (which would spoil the photo), we measure the photo and let the tokens
 * flip.
 *
 * Two measurements, in order of preference:
 *
 *  1. The pixels themselves, averaged. `measurePhotoLuminance` downscales the
 *     image into a tiny canvas — the browser's own filtering does the
 *     averaging — and reads the mean relative luminance back out.
 *
 *  2. `photo.color`, Unsplash's own dominant-colour hex. Used as the
 *     immediate answer while (1) is still loading, and as the answer outright
 *     if it fails (a tainted canvas, a blocked request, an image that never
 *     decodes).
 *
 * (1) deliberately fetches a *thumbnail* rather than reusing the full-size
 * photo: the displayed image is loaded without CORS, and re-requesting it
 * with `crossOrigin` set would miss that cache entry and pull a second copy
 * of a 2000px JPEG. `thumbnailUrlFor` rewrites Unsplash's sizing parameters
 * down to 32px instead, which is a few hundred bytes and doesn't touch the
 * API rate limit (imgix delivery isn't metered — only api.unsplash.com is).
 */

/** Size of the square we downscale into. Small enough that the GPU's own
 *  filtering does the averaging for us, big enough that a photo which is
 *  dark only in one corner doesn't read as dark overall. */
const SAMPLE_SIZE = 16;

/**
 * Above this mean relative luminance the photo counts as light.
 *
 * White text needs a backdrop under ~0.18 to clear 4.5:1, and near-black text
 * needs one over ~0.20, so the theoretical crossover sits around 0.19. This
 * is set higher because the two sides aren't symmetrical in practice: the
 * scrim, the text shadow and the glass surfaces all buy the white palette
 * extra room, so a mid-toned photo still reads fine in the default treatment.
 * Flipping only past 0.32 keeps the dark palette for photos that genuinely
 * need it rather than for anything merely brighter than average.
 */
const LIGHT_TONE_THRESHOLD = 0.32;

/** Fallback when there is no photo at all — matches `body`'s base colour. */
export const DEFAULT_TONE = 'dark';

/**
 * sRGB relative luminance (WCAG 2.x), on 0–255 channels.
 * @returns {number} 0 (black) to 1 (white)
 */
function relativeLuminance(red, green, blue) {
  const linear = (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/**
 * @param {string} hex  `#rgb` or `#rrggbb`
 * @returns {number|null} relative luminance, or null if it isn't a hex colour
 */
export function luminanceFromHex(hex) {
  if (typeof hex !== 'string') return null;
  const digits = hex.trim().replace(/^#/, '');
  const full =
    digits.length === 3 ? digits.split('').map((digit) => digit + digit).join('') : digits;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;

  const value = parseInt(full, 16);
  return relativeLuminance((value >> 16) & 255, (value >> 8) & 255, value & 255);
}

/**
 * Turns a measured luminance into the tone the palette keys off.
 * @param {number|null} luminance
 * @returns {'light'|'dark'}
 */
export function toneFromLuminance(luminance) {
  if (typeof luminance !== 'number' || Number.isNaN(luminance)) return DEFAULT_TONE;
  return luminance > LIGHT_TONE_THRESHOLD ? 'light' : DEFAULT_TONE;
}

/**
 * A tiny version of the photo to measure, so we never download the big one
 * twice. Unsplash URLs carry their sizing in the query string (see
 * `normalisePhoto` in unsplashService.js), so the width and quality are just
 * rewritten. Anything else — the bundled SVG gradients, most obviously — is
 * measured as-is; those are same-origin and already small.
 *
 * @param {Photo} photo
 * @returns {string}
 */
export function thumbnailUrlFor(photo) {
  try {
    const url = new URL(photo.imageUrl, window.location.href);
    if (!url.searchParams.has('w')) return photo.imageUrl;

    url.searchParams.set('w', String(SAMPLE_SIZE * 4));
    url.searchParams.set('q', '40');
    return url.toString();
  } catch {
    // Not a parseable URL (a `blob:`/`data:` handle, say) — measure it directly.
    return photo.imageUrl;
  }
}

/**
 * Averages a photo's pixels into one luminance value.
 *
 * Resolves to null rather than rejecting on every failure path — a blocked
 * request, an image that never decodes, a canvas the browser refuses to read
 * back because the image arrived without CORS headers. The caller then keeps
 * whatever `photo.color` gave it, which is the point: a background is
 * decoration, and no measurement of it should ever be able to break the page.
 *
 * @param {Photo} photo
 * @returns {Promise<number|null>}
 */
export function measurePhotoLuminance(photo) {
  return new Promise((resolve) => {
    const image = new Image();
    // Without this the canvas is tainted and `getImageData` throws. Unsplash
    // serves `Access-Control-Allow-Origin: *`; anything that doesn't simply
    // fails to load here and falls back to the dominant colour.
    image.crossOrigin = 'anonymous';

    image.onerror = () => resolve(null);
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;

        const context = canvas.getContext('2d', { willReadFrequently: false });
        if (!context) return resolve(null);

        // The downscale *is* the averaging step — every source pixel is
        // folded into the 16×16 result by the browser's own filtering.
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

        let total = 0;
        let counted = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Fully transparent pixels show the page behind them, not the
          // photo, so they'd drag the average toward a colour that isn't on
          // screen. (SVG gradients with soft edges have plenty of these.)
          if (data[i + 3] === 0) continue;
          total += relativeLuminance(data[i], data[i + 1], data[i + 2]);
          counted += 1;
        }

        resolve(counted > 0 ? total / counted : null);
      } catch {
        resolve(null); // tainted canvas, or no 2D context available
      }
    };

    image.src = thumbnailUrlFor(photo);
  });
}
