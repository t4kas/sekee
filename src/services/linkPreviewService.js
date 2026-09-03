/**
 * Link previews
 * ---------------------------------------------------------------------------
 * Fetches a page's title and meta description so a URL-shaped autocomplete
 * suggestion can render as a small card — the same information a browser's
 * own address bar shows for a matching history entry.
 *
 * There's no backend to fetch and parse the page's HTML through (see
 * CLAUDE.md's "no backend" note), and fetching an arbitrary third-party
 * page's HTML directly from the browser would be blocked by CORS almost
 * everywhere anyway. microlink.io fetches and parses the page server-side
 * and returns JSON with CORS enabled — exactly what a static page needs —
 * and unlike Unsplash, it needs no API key at this volume of traffic.
 *
 * Never throws: any failure (network, timeout, no metadata, rate limit)
 * resolves to `null`, and the card falls back to just the hostname and
 * favicon — a dropdown row must never break because a preview couldn't be
 * fetched.
 */

const PREVIEW_ENDPOINT = 'https://api.microlink.io';

/** Bounds how long a preview request can hang before giving up on it. */
const TIMEOUT_MS = 4000;

/** In-memory only, and never evicted — previews are cheap to refetch on a
 *  fresh tab, and this just avoids re-requesting the same URL while it's
 *  repeatedly re-suggested across a few keystrokes in one session. Caches
 *  `null` too, so a URL with no usable metadata isn't retried every time it
 *  resurfaces. */
const cache = new Map();

/**
 * @param {string} url an absolute http(s) URL (see `normaliseUrl`)
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ title: string, description: string|null } | null>}
 */
export async function fetchLinkPreview(url, { signal } = {}) {
  if (cache.has(url)) return cache.get(url);

  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const params = new URLSearchParams({ url, meta: 'true' });
    const response = await fetch(`${PREVIEW_ENDPOINT}/?${params}`, { signal: requestSignal });
    if (!response.ok) throw new Error(`Preview request failed: ${response.status}`);

    const { status, data } = await response.json();
    if (status !== 'success' || !data?.title) throw new Error('No preview metadata');

    const preview = { title: data.title, description: data.description || null };
    cache.set(url, preview);
    return preview;
  } catch (error) {
    // The caller's own signal aborting means `url` changed again — a
    // fresher call already owns the result, so don't cache a non-answer.
    if (signal?.aborted) throw error;

    console.warn('[linkPreviewService] falling back to no preview:', error.message);
    cache.set(url, null);
    return null;
  }
}
