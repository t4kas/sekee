/**
 * Bookmarks service
 * ---------------------------------------------------------------------------
 * All bookmark reads and writes go through here. Components never touch
 * storage directly — they call `useBookmarks()`, which calls this file.
 *
 * Every function is async and returns plain data, which is exactly the shape
 * a Supabase-backed version would have. Replacing the body of each function
 * with a `supabase.from('bookmarks')...` call would be the whole migration.
 *
 * A bookmark looks like:
 *   {
 *     id:        string,  // stable, generated on create
 *     title:     string,  // what the user sees on the tile
 *     url:       string,  // normalised, always includes a protocol
 *     createdAt: number,  // epoch ms — used to keep ordering stable
 *   }
 */

import { storage, StorageKeys } from './storage.js';

/** A handful of starter tiles, shown the very first time the app runs so the
 *  grid isn't an empty void. Once the user edits anything, this is never
 *  consulted again. */
const SEED_BOOKMARKS = [
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'YouTube', url: 'https://youtube.com' },
  { title: 'Hacker News', url: 'https://news.ycombinator.com' },
  { title: 'React Aria', url: 'https://react-aria.adobe.com' },
  { title: 'MDN', url: 'https://developer.mozilla.org' },
];

/** Generates a unique id. `crypto.randomUUID` is available in every browser
 *  we care about; the fallback keeps things working on older ones and in
 *  non-secure contexts (where `crypto` may be missing). */
function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The only schemes a bookmark may use. This is a security boundary, not a
 *  nicety: bookmark URLs end up in an <a href>, and without this check a
 *  `javascript:` or `data:` URL would be a script-injection vector. */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Decides whether a hostname is plausible enough to save.
 *
 * We can't rely on `new URL()` alone for this. It is far more permissive than
 * you'd expect — browsers happily parse `https://a` (hostname "a") and even
 * percent-encode their way through `https://ht tp://%%%` rather than
 * rejecting it. So we check the hostname ourselves.
 */
function isPlausibleHostname(hostname) {
  if (!hostname) return false;

  // Useful for local development servers.
  if (hostname === 'localhost') return true;

  // IPv4, and IPv6 (which `new URL` hands back in [brackets]).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (hostname.startsWith('[')) return true;

  // Otherwise require at least one dot and a letters-only TLD, e.g.
  // "example.com" or "news.bbc.co.uk". Internationalised domains are already
  // punycode ("xn--mnchen-3ya.de") by the time we see them, so they pass.
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(hostname);
}

/**
 * Turns whatever the user typed into a URL we can actually navigate to.
 * People type "github.com", not "https://github.com".
 *
 * @returns {string} a validated, absolute http(s) URL
 * @throws {Error} with a message suitable for showing next to the field
 */
export function normaliseUrl(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) throw new Error('URL is required');

  // Caught early so the message is specific: a stray space is a common typo,
  // and the URL parser would otherwise silently encode it as %20.
  if (/\s/.test(trimmed)) throw new Error("A URL can't contain spaces");

  // Only treat the input as already having a scheme if it's followed by
  // "//" — otherwise "localhost:3000" would look like a "localhost:" scheme.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);

  // Local addresses get http, everything else https. Dev servers almost
  // never speak TLS, so defaulting "localhost:3000" to https would produce a
  // bookmark that just fails to load. This matches what browsers' address
  // bars do.
  const assumedScheme = /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(trimmed)
    ? 'http://'
    : 'https://';

  const withProtocol = hasScheme ? trimmed : assumedScheme + trimmed;

  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error(`"${trimmed}" doesn't look like a valid URL`);
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new Error('Only http:// and https:// links can be bookmarked');
  }

  if (!isPlausibleHostname(url.hostname)) {
    throw new Error(`"${trimmed}" doesn't look like a valid URL`);
  }

  return url.toString();
}

/** Fills in a sensible title when the user leaves the title field blank:
 *  "https://news.ycombinator.com/x" -> "news.ycombinator.com" */
export function titleFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Reads the raw array out of storage, seeding it on first run. */
async function readAll() {
  const stored = await storage.read(StorageKeys.bookmarks);

  if (Array.isArray(stored)) return stored;

  // First run: persist the seed list so it behaves like any other data
  // (the user can edit and delete these tiles straight away).
  const seeded = SEED_BOOKMARKS.map((bookmark, index) => ({
    id: createId(),
    title: bookmark.title,
    url: bookmark.url,
    createdAt: Date.now() + index, // +index keeps the original order stable
  }));

  await storage.write(StorageKeys.bookmarks, seeded);
  return seeded;
}

/** @returns {Promise<Array>} all bookmarks, oldest first. */
export async function listBookmarks() {
  const bookmarks = await readAll();
  return [...bookmarks].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Adds a bookmark.
 * @param {{ title?: string, url: string }} input
 * @returns {Promise<Array>} the full updated list
 */
export async function createBookmark({ title, url }) {
  const normalisedUrl = normaliseUrl(url);
  const bookmarks = await readAll();

  const next = [
    ...bookmarks,
    {
      id: createId(),
      title: title?.trim() || titleFromUrl(normalisedUrl),
      url: normalisedUrl,
      createdAt: Date.now(),
    },
  ];

  await storage.write(StorageKeys.bookmarks, next);
  return next;
}

/**
 * Updates one bookmark in place.
 * @param {string} id
 * @param {{ title?: string, url?: string }} changes
 * @returns {Promise<Array>} the full updated list
 */
export async function updateBookmark(id, changes) {
  const bookmarks = await readAll();

  const next = bookmarks.map((bookmark) => {
    if (bookmark.id !== id) return bookmark;

    const url = changes.url ? normaliseUrl(changes.url) : bookmark.url;
    return {
      ...bookmark,
      url,
      title: changes.title?.trim() || titleFromUrl(url),
    };
  });

  await storage.write(StorageKeys.bookmarks, next);
  return next;
}

/**
 * Removes a bookmark.
 * @param {string} id
 * @returns {Promise<Array>} the full updated list
 */
export async function deleteBookmark(id) {
  const bookmarks = await readAll();
  const next = bookmarks.filter((bookmark) => bookmark.id !== id);

  await storage.write(StorageKeys.bookmarks, next);
  return next;
}

/** Lets the hook react to edits made in another tab. */
export function subscribeToBookmarks(callback) {
  return storage.subscribe(StorageKeys.bookmarks, (value) => {
    callback(Array.isArray(value) ? value : []);
  });
}
