/**
 * Unsplash service
 * ---------------------------------------------------------------------------
 * Fetches background photos, and is the only file that knows Unsplash exists.
 * Everything downstream works with the normalised `Photo` shape below, so a
 * different photo source would only need to produce that same shape.
 *
 *   Photo = {
 *     id:               string,
 *     imageUrl:         string,  // ready to render, already sized
 *     color:            string,  // dominant colour, shown while loading
 *     altText:          string,
 *     photographerName: string,
 *     photographerUrl:  string,  // profile link (Unsplash requires this)
 *     unsplashUrl:      string,  // link back to unsplash.com
 *     downloadLocation: string | null, // endpoint to ping — see below
 *     isFallback:       boolean, // true = bundled gradient, no credit needed
 *   }
 *
 * UNSPLASH API GUIDELINES — the two rules this file exists to honour:
 *
 *  1. ATTRIBUTION. Whenever a photo is shown, credit the photographer with a
 *     link to their profile and a link back to Unsplash, both carrying our
 *     UTM parameters. `PhotoCredit.jsx` renders this from the fields above.
 *
 *  2. DOWNLOAD TRACKING. When a photo is actually *used*, we must GET the
 *     photo's `links.download_location`. This does not download anything —
 *     it's how Unsplash counts a photo's usage and credits the photographer.
 *     See `trackPhotoUse()`.
 *
 * QUOTA. A free "demo" Unsplash key allows 50 requests per hour. Loading one
 * photo per new tab would burn through that in a single browsing session, so
 * instead we fetch a POOL of photos in one request and cache it; each new tab
 * picks a random photo from the cached pool. One request every few hours
 * instead of one per tab, while still rotating on every load.
 */

import { storage, StorageKeys } from './storage.js';
import { getCategory } from './backgroundCategories.js';

// Bundled fallbacks. Vite turns these imports into URLs at build time, so the
// images are hashed, cached and served like any other asset.
import duskFallback from '../assets/backgrounds/dusk.svg';
import tideFallback from '../assets/backgrounds/tide.svg';
import emberFallback from '../assets/backgrounds/ember.svg';
import mossFallback from '../assets/backgrounds/moss.svg';

const API_BASE = 'https://api.unsplash.com';

/** Unsplash asks that attribution links identify the referring app. */
const UTM = 'utm_source=sekee&utm_medium=referral';

/** How many photos to pull per request. 30 is Unsplash's maximum for
 *  `/photos/random`; 12 is plenty of variety for a few hours of tabs. */
const POOL_SIZE = 12;

/** How long a cached pool stays fresh. */
const POOL_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Read once at module load. Vite inlines `import.meta.env` at build time. */
const ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY?.trim() || '';

/** True when the app has a key configured and can talk to Unsplash at all. */
export const isUnsplashConfigured = Boolean(ACCESS_KEY);

const FALLBACK_PHOTOS = [
  { id: 'fallback-dusk', imageUrl: duskFallback, color: '#1b1033', altText: 'Purple and amber gradient' },
  { id: 'fallback-tide', imageUrl: tideFallback, color: '#04212e', altText: 'Teal and green gradient' },
  { id: 'fallback-ember', imageUrl: emberFallback, color: '#25100c', altText: 'Warm orange gradient' },
  { id: 'fallback-moss', imageUrl: mossFallback, color: '#0d1a12', altText: 'Deep green gradient' },
];

/** Picks a random element. Used both for the fallbacks and the photo pool
 *  here, and by `useBackground.js` to pick among favorited photos. */
export function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

/** A bundled gradient, dressed up in the same shape as an Unsplash photo so
 *  callers never have to branch on where the image came from. */
function getFallbackPhoto() {
  const fallback = pickRandom(FALLBACK_PHOTOS);
  return {
    ...fallback,
    photographerName: '',
    photographerUrl: '',
    unsplashUrl: '',
    downloadLocation: null,
    isFallback: true,
  };
}

/**
 * Converts Unsplash's API response into our `Photo` shape.
 *
 * We build the image URL from `urls.raw` plus our own sizing parameters
 * (Unsplash's recommended approach) rather than using `urls.regular`, so we
 * ask for exactly the width we need instead of a fixed 1080px.
 */
function normalisePhoto(raw) {
  return {
    id: raw.id,
    imageUrl: `${raw.urls.raw}&w=2000&q=80&fm=jpg&fit=max`,
    color: raw.color ?? '#14161c',
    altText: raw.alt_description || raw.description || 'Unsplash background photo',
    photographerName: raw.user?.name ?? 'Unknown',
    photographerUrl: `${raw.user?.links?.html ?? 'https://unsplash.com'}?${UTM}`,
    unsplashUrl: `https://unsplash.com/?${UTM}`,
    downloadLocation: raw.links?.download_location ?? null,
    isFallback: false,
  };
}

/** One request for a batch of random photos in a category. */
async function fetchPhotoPool(categoryId) {
  const category = getCategory(categoryId);

  const params = new URLSearchParams({
    query: category.query,
    count: String(POOL_SIZE),
    orientation: 'landscape',
    content_filter: 'high', // skip anything Unsplash flags as sensitive
  });

  const response = await fetch(`${API_BASE}/photos/random?${params}`, {
    headers: {
      Authorization: `Client-ID ${ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  });

  if (!response.ok) {
    // 401 = bad key, 403 = hourly rate limit exhausted. Both are worth
    // surfacing in the console, but neither should break the page.
    throw new Error(`Unsplash responded ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // With `count`, the endpoint returns an array; without it, a single object.
  return (Array.isArray(data) ? data : [data]).map(normalisePhoto);
}

/**
 * Pool requests that are currently in flight, keyed by category.
 *
 * Two things can ask for the same pool at nearly the same moment: React's
 * StrictMode runs effects twice in development, and both runs miss the cache
 * because neither has written it yet. Sharing one promise means one network
 * request instead of two — which matters when the free Unsplash tier allows
 * only 50 per hour.
 */
const inFlightPools = new Map();

/** `fetchPhotoPool`, but concurrent callers share a single request. */
function fetchPhotoPoolOnce(categoryId) {
  if (!inFlightPools.has(categoryId)) {
    const request = fetchPhotoPool(categoryId).finally(() => {
      inFlightPools.delete(categoryId);
    });
    inFlightPools.set(categoryId, request);
  }

  return inFlightPools.get(categoryId);
}

/** Cached pools are stored per category, so switching category and switching
 *  back doesn't force a refetch. */
async function readCache() {
  const cache = await storage.read(StorageKeys.photoCache);
  return cache && typeof cache === 'object' ? cache : {};
}

/**
 * Returns a photo to use as the background right now.
 *
 * Never throws: if anything goes wrong (no key, no network, rate limited,
 * malformed response) it returns a bundled gradient instead. A new-tab page
 * has to render.
 *
 * @param {string} categoryId
 * @returns {Promise<Photo>}
 */
export async function getBackgroundPhoto(categoryId) {
  if (!isUnsplashConfigured) return getFallbackPhoto();

  const cache = await readCache();
  const entry = cache[categoryId];
  const isFresh =
    entry &&
    Array.isArray(entry.photos) &&
    entry.photos.length > 0 &&
    Date.now() - entry.fetchedAt < POOL_TTL_MS;

  // Fast path: a fresh pool is already cached, so just pick from it. No
  // network request at all — this is what makes per-tab rotation cheap.
  if (isFresh) return pickRandom(entry.photos);

  try {
    const photos = await fetchPhotoPoolOnce(categoryId);
    if (photos.length === 0) return getFallbackPhoto();

    await storage.write(StorageKeys.photoCache, {
      ...cache,
      [categoryId]: { fetchedAt: Date.now(), photos },
    });

    return pickRandom(photos);
  } catch (error) {
    console.warn('[unsplash] falling back to a bundled background:', error.message);

    // A stale pool still beats a gradient, so prefer it if we have one.
    if (entry?.photos?.length) return pickRandom(entry.photos);
    return getFallbackPhoto();
  }
}

/**
 * Tells Unsplash a photo was used. REQUIRED by their API guidelines.
 *
 * Fire-and-forget: we never await this or surface its errors, because the
 * user's background has already rendered by the time it runs.
 *
 * @param {Photo} photo
 */
export function trackPhotoUse(photo) {
  if (!isUnsplashConfigured || !photo?.downloadLocation) return;

  fetch(photo.downloadLocation, {
    headers: {
      Authorization: `Client-ID ${ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  }).catch((error) => {
    console.warn('[unsplash] download tracking ping failed:', error.message);
  });
}

/** Drops every cached pool — used by the "New photo" button in settings so
 *  you can force a fresh batch without waiting for the TTL. */
export async function clearPhotoCache() {
  await storage.remove(StorageKeys.photoCache);
}
