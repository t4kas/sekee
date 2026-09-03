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
 *     id:           string,       // stable, generated on create
 *     title:        string,       // what the user sees on the tile
 *     url:          string,       // normalised, always includes a protocol
 *     groupId:      string,       // which tab (see bookmarkGroupsService.js)
 *     order:        number,       // display position WITHIN its group
 *     createdAt:    number,       // epoch ms
 *     lastOpenedAt: number|null,  // epoch ms, null = never — see recordBookmarkOpened
 *   }
 */

import { storage, StorageKeys } from './storage.js';
import { DEFAULT_GROUP_ID } from './bookmarkGroupsService.js';

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

/** Like `normaliseUrl`, but returns `null` instead of throwing — for call
 *  sites that just want to know "is this a URL?" without a try/catch, e.g.
 *  deciding whether an autocomplete suggestion should render as a link
 *  preview card. */
export function tryNormaliseUrl(input) {
  try {
    return normaliseUrl(input);
  } catch {
    return null;
  }
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

/**
 * Reads the raw array out of storage, seeding it on first run and migrating
 * any bookmark saved before groups/manual ordering existed — one saved
 * without a `groupId` goes into the default group, keeping its relative
 * position via `order: createdAt` (every bookmark from that era already
 * sorted correctly by `createdAt`, so reusing it as the initial `order`
 * preserves that order exactly).
 */
async function readAll() {
  const stored = await storage.read(StorageKeys.bookmarks);
  if (!Array.isArray(stored)) return seedBookmarks();

  let migrated = false;
  const next = stored.map((bookmark) => {
    if (bookmark.groupId && typeof bookmark.order === 'number') return bookmark;
    migrated = true;
    return {
      ...bookmark,
      groupId: bookmark.groupId ?? DEFAULT_GROUP_ID,
      order: typeof bookmark.order === 'number' ? bookmark.order : bookmark.createdAt,
      lastOpenedAt: bookmark.lastOpenedAt ?? null,
    };
  });

  if (migrated) await storage.write(StorageKeys.bookmarks, next);
  return next;
}

async function seedBookmarks() {
  const seeded = SEED_BOOKMARKS.map((bookmark, index) => ({
    id: createId(),
    title: bookmark.title,
    url: bookmark.url,
    groupId: DEFAULT_GROUP_ID,
    order: index,
    createdAt: Date.now() + index, // +index keeps the original order stable
    lastOpenedAt: null,
  }));

  await storage.write(StorageKeys.bookmarks, seeded);
  return seeded;
}

/** @returns {Promise<Array>} all bookmarks, across every group, ordered
 *  within each group by `order` — filtering to one group is the caller's
 *  job (see `useBookmarkGroups.js`), since it depends on UI state this
 *  service doesn't know about. */
export async function listBookmarks() {
  const bookmarks = await readAll();
  return [...bookmarks].sort((a, b) => a.order - b.order);
}

/**
 * Adds a bookmark.
 * @param {{ title?: string, url: string, groupId?: string }} input
 * @returns {Promise<Array>} the full updated list
 */
export async function createBookmark({ title, url, groupId }) {
  const normalisedUrl = normaliseUrl(url);
  const bookmarks = await readAll();
  const targetGroupId = groupId ?? DEFAULT_GROUP_ID;

  // Appending within the target group, not the whole list, so a new
  // bookmark always lands last in the tab it was added to rather than
  // wherever the global array happened to end.
  const siblingCount = bookmarks.filter((bookmark) => bookmark.groupId === targetGroupId).length;

  const next = [
    ...bookmarks,
    {
      id: createId(),
      title: title?.trim() || titleFromUrl(normalisedUrl),
      url: normalisedUrl,
      groupId: targetGroupId,
      order: siblingCount,
      createdAt: Date.now(),
      lastOpenedAt: null,
    },
  ];

  await storage.write(StorageKeys.bookmarks, next);
  return next;
}

/**
 * Updates one bookmark in place — including moving it to a different group,
 * which appends it to the end of that group (same reasoning as
 * `createBookmark`'s `siblingCount`) rather than trying to preserve a
 * position that was only ever meaningful in the old group.
 * @param {string} id
 * @param {{ title?: string, url?: string, groupId?: string }} changes
 * @returns {Promise<Array>} the full updated list
 */
export async function updateBookmark(id, changes) {
  const bookmarks = await readAll();

  const movingToGroupId =
    changes.groupId && changes.groupId !== bookmarks.find((bookmark) => bookmark.id === id)?.groupId
      ? changes.groupId
      : null;
  const newOrderInGroup = movingToGroupId
    ? bookmarks.filter((bookmark) => bookmark.groupId === movingToGroupId).length
    : null;

  const next = bookmarks.map((bookmark) => {
    if (bookmark.id !== id) return bookmark;

    const url = changes.url ? normaliseUrl(changes.url) : bookmark.url;
    return {
      ...bookmark,
      url,
      title: changes.title?.trim() || titleFromUrl(url),
      groupId: movingToGroupId ?? bookmark.groupId,
      order: newOrderInGroup ?? bookmark.order,
    };
  });

  await storage.write(StorageKeys.bookmarks, next);
  return next;
}

/**
 * Rewrites `order` for bookmarks within one group to match `orderedIds` —
 * called after a drag-and-drop reorder in the grid. Ids outside
 * `orderedIds` (every other group's bookmarks) are left untouched, so the
 * caller only needs to pass the ids of the group being reordered.
 * @param {string[]} orderedIds
 * @returns {Promise<Array>} the full updated list
 */
export async function reorderBookmarks(orderedIds) {
  const bookmarks = await readAll();
  const orderIndex = new Map(orderedIds.map((id, index) => [id, index]));

  const next = bookmarks.map((bookmark) =>
    orderIndex.has(bookmark.id) ? { ...bookmark, order: orderIndex.get(bookmark.id) } : bookmark,
  );

  await storage.write(StorageKeys.bookmarks, next);
  return next;
}

/**
 * Moves every bookmark in `fromGroupId` into `toGroupId`, appending them
 * after whatever's already there. Called by `useBookmarkGroups.js` right
 * before deleting a group, so nothing gets orphaned pointing at a group
 * that no longer exists.
 * @param {string} fromGroupId
 * @param {string} toGroupId
 * @returns {Promise<Array>} the full updated list
 */
export async function reassignGroup(fromGroupId, toGroupId) {
  const bookmarks = await readAll();
  let nextOrder = bookmarks.filter((bookmark) => bookmark.groupId === toGroupId).length;

  const next = bookmarks.map((bookmark) => {
    if (bookmark.groupId !== fromGroupId) return bookmark;
    return { ...bookmark, groupId: toGroupId, order: nextOrder++ };
  });

  await storage.write(StorageKeys.bookmarks, next);
  return next;
}

/**
 * Records that a bookmark was just opened, for the "most recently opened"
 * sort mode (see `settingsService.js`'s `bookmarkSortMode`). Fire-and-forget
 * from the caller's point of view — clicking a tile navigates away
 * immediately, so nothing awaits this — which is fine: the write is already
 * dispatched before the browser unloads the page.
 * @param {string} id
 * @returns {Promise<Array>} the full updated list
 */
export async function recordBookmarkOpened(id) {
  const bookmarks = await readAll();
  const next = bookmarks.map((bookmark) =>
    bookmark.id === id ? { ...bookmark, lastOpenedAt: Date.now() } : bookmark,
  );

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
