/**
 * Custom background service
 * ---------------------------------------------------------------------------
 * Background images the user uploaded themselves, kept in THEIR OWN cloud
 * storage — the `personal` scope in `fileStorageService.js`, i.e. whichever
 * of Google Drive or Dropbox they linked on the Settings → Files tab. A
 * wallpaper is exactly what that scope is for: it's their file, on their
 * quota, and nobody else's browser ever has to fetch it. Uploading is
 * therefore only possible with storage linked, which is what the error from
 * `getStore` says.
 *
 * TWO PIECES OF STATE, IN TWO DIFFERENT PLACES, on purpose — this is the
 * split described at the top of CLAUDE.md:
 *
 *   the image bytes   the personal file store, under `backgrounds/<id>.<ext>`
 *   the record        `storage` (localStorage, or the account when signed in)
 *
 * So the list of uploads syncs between devices the same way bookmarks and
 * settings do, while the images themselves never pass through this app's
 * own storage. The consequence is that a device which has the records but
 * hasn't linked the provider holding the files can't resolve them:
 * `resolvePhoto` returns null there and `useBackground.js` falls back to an
 * ordinary category photo rather than showing an empty screen. Each record
 * keeps the `providerId` it was uploaded to so that case can be *named* in
 * the UI ("stored in Dropbox") instead of just failing quietly.
 *
 * THE AVERAGE COLOUR IS MEASURED ONCE, AT UPLOAD, and kept on the record.
 * `useBackgroundTone.js` flips the whole palette for a light background, and
 * its own pixel measurement can't reach these images: it loads them with
 * `crossOrigin` set, which a Dropbox temporary link (no CORS headers) fails
 * outright, leaving the tone to fall back to `photo.color`. A hardcoded dark
 * colour there would mean white-on-white text on someone's snowy wallpaper.
 * Here the file is in hand and same-origin, so it can just be measured — and
 * that also gets the first paint right, before any measurement runs.
 *
 * NO URL IS EVER PERSISTED. Dropbox's links expire in hours and Drive's are
 * tab-lifetime `blob:` handles, so the record holds the PATH and every
 * viewing of an upload goes back through `resolvePhoto`/`releasePhoto`.
 * Callers must pair those two — `releasePhoto` is a no-op on the stores that
 * don't need it, so it can always be called. See `fileStorageService.js`.
 */

import { storage, StorageKeys } from './storage.js';
import { FileScopes, getPersonalStore, getStore } from './fileStorageService.js';

/** Where uploads live inside the app's own folder in the user's storage. */
const FOLDER = 'backgrounds';

/** Big enough for a real wallpaper, small enough not to surprise someone
 *  with what just went into their Drive. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** What the file picker offers and what `addCustomBackground` accepts. The
 *  browser is the one that has to render this in an `<img>`, so the check is
 *  "is it an image", not a list of extensions. */
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/avif,image/gif';

/** Falls back to a generic extension rather than none: Drive and Dropbox
 *  both key their own previews off the file name, and a wallpaper with no
 *  extension looks like a broken file in the user's folder. */
function extensionFor(file) {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1];
  if (fromName) return fromName.toLowerCase();

  const fromType = /^image\/([a-z0-9+.-]+)$/i.exec(file.type)?.[1];
  return fromType === 'jpeg' ? 'jpg' : (fromType ?? 'img');
}

/** Matches `Background.jsx`'s own base colour — used when an image can't be
 *  measured, and for records written before colours were stored. */
const DEFAULT_COLOR = '#14161c';

/** Big enough to average fairly, small enough to be free. */
const SAMPLE_SIZE = 16;

/**
 * The image's average colour, for the palette flip described above.
 *
 * Never throws: a browser without `createImageBitmap`, a file that decodes to
 * nothing, a canvas that won't hand back a context — all of them just mean
 * "no measurement", and the upload itself must not fail over it.
 *
 * @param {Blob} file
 * @returns {Promise<string>} `#rrggbb`
 */
async function measureAverageColor(file) {
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);

    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return DEFAULT_COLOR;

    // The downscale is the averaging — the same trick `backgroundTone.js`
    // uses on the photo it measures over the network.
    context.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    const totals = [0, 0, 0];
    let counted = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Transparent pixels show the page, not the image (a PNG with a cut-out
      // corner, say), so they'd pull the average toward a colour nobody sees.
      if (data[i + 3] === 0) continue;
      totals[0] += data[i];
      totals[1] += data[i + 1];
      totals[2] += data[i + 2];
      counted += 1;
    }
    if (counted === 0) return DEFAULT_COLOR;

    return `#${totals
      .map((total) => Math.round(total / counted).toString(16).padStart(2, '0'))
      .join('')}`;
  } catch (error) {
    console.warn('[custom-background] could not measure the image colour', error);
    return DEFAULT_COLOR;
  } finally {
    bitmap?.close();
  }
}

/** @returns {Promise<CustomBackground[]>} */
export async function listCustomBackgrounds() {
  const stored = await storage.read(StorageKeys.customBackgrounds);
  return Array.isArray(stored) ? stored : [];
}

/**
 * Uploads an image and records it.
 *
 * The file goes up FIRST and the record is written only once that resolves,
 * so a failed upload leaves nothing behind pointing at a file that isn't
 * there. (The reverse order can't be fixed up afterwards: the write that
 * would remove the record can fail too.)
 *
 * @param {File} file from an `<input type="file">`
 * @returns {Promise<{backgrounds: CustomBackground[], added: CustomBackground}>}
 */
export async function addCustomBackground(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('That’s not an image — pick a JPEG, PNG, WebP, AVIF or GIF.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`That image is too large — ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB is the limit.`);
  }

  // Throws with "Connect Google Drive or Dropbox…" when nothing is linked,
  // which is the message the Personalisation tab shows.
  const store = getStore(FileScopes.personal);

  // Before the upload: a file that can't even be decoded here is one the
  // browser won't render as a background either.
  const color = await measureAverageColor(file);

  const id = crypto.randomUUID();
  const path = `${FOLDER}/${id}.${extensionFor(file)}`;
  await store.upload(path, file, { contentType: file.type });

  const added = {
    id,
    path,
    /** The original file name, shown in the UI — the stored one is a uuid. */
    name: file.name,
    contentType: file.type,
    size: file.size,
    /** Average colour — see the header. Shown under the image while it
     *  loads, and what the palette's light/dark flip keys off. */
    color,
    providerId: store.id,
    addedAt: Date.now(),
  };

  const backgrounds = [...(await listCustomBackgrounds()), added];
  await storage.write(StorageKeys.customBackgrounds, backgrounds);
  return { backgrounds, added };
}

/**
 * Deletes the image and forgets the record.
 *
 * The delete is best-effort: a file that's already gone, or a provider that
 * isn't linked on this device, must not leave an entry the user can't get
 * rid of. Removing the record is the part that has to happen.
 *
 * @param {string} id
 * @returns {Promise<CustomBackground[]>} the full updated list
 */
export async function removeCustomBackground(id) {
  const current = await listCustomBackgrounds();
  const target = current.find((background) => background.id === id);

  if (target) {
    await getPersonalStore()
      ?.remove(target.path)
      .catch((error) => {
        console.warn('[custom-background] could not delete the stored image', error);
      });
  }

  const next = current.filter((background) => background.id !== id);
  await storage.write(StorageKeys.customBackgrounds, next);
  return next;
}

/**
 * Resolves one record into a `Photo` (see `unsplashService.js`) the rest of
 * the app can render without knowing where the image came from.
 *
 * `isFallback: true` is not a lie about the source — it's the flag meaning
 * "no Unsplash attribution applies", which is what keeps `PhotoCredit` and
 * the favorite heart (favorites store whole `Photo` records, URL included,
 * which is precisely what must not be persisted here) off an upload.
 *
 * @param {CustomBackground} background
 * @returns {Promise<Photo|null>} null when the image can't be reached —
 *   nothing linked on this device, a different provider, or a deleted file.
 */
export async function resolveCustomBackgroundPhoto(background) {
  const store = getPersonalStore();
  if (!store) return null;

  const imageUrl = await store.getViewUrl(background.path).catch((error) => {
    console.warn('[custom-background] could not resolve the stored image', error);
    return null;
  });
  if (!imageUrl) return null;

  return {
    id: background.id,
    imageUrl,
    color: background.color ?? DEFAULT_COLOR,
    altText: background.name,
    photographerName: '',
    photographerUrl: '',
    unsplashUrl: '',
    downloadLocation: null,
    isFallback: true,
    /** Tells `useBackground.js` this URL is borrowed and has to be released. */
    isCustom: true,
  };
}

/**
 * The other half of `resolveCustomBackgroundPhoto`. Safe to call with
 * anything — a non-custom photo, a null, a URL from a store that's since
 * been unlinked.
 *
 * @param {Photo|null} photo
 */
export function releaseCustomBackgroundPhoto(photo) {
  if (!photo?.isCustom) return;
  try {
    getPersonalStore()?.releaseViewUrl(photo.imageUrl);
  } catch (error) {
    console.warn('[custom-background] could not release the image URL', error);
  }
}
