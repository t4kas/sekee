/**
 * Favicons
 * ---------------------------------------------------------------------------
 * Bookmark tiles show the site's icon. Rather than fetching and parsing each
 * page's HTML for a <link rel="icon">, we use Google's public favicon
 * service, which takes a domain and returns a PNG.
 *
 * Isolated in its own file so switching services later (e.g. DuckDuckGo's
 * `icons.duckduckgo.com/ip3/<domain>.ico`) is a one-line change.
 */

const FAVICON_ENDPOINT = 'https://www.google.com/s2/favicons';

/**
 * @param {string} url  a full bookmark URL
 * @param {number} size requested pixel size — 16, 32, 64 and 128 work well
 * @returns {string|null} an image URL, or null if the bookmark URL is unusable
 */
export function getFaviconUrl(url, size = 64) {
  try {
    // The service wants an origin, not the full path.
    const { origin } = new URL(url);
    const params = new URLSearchParams({ domain: origin, sz: String(size) });
    return `${FAVICON_ENDPOINT}?${params}`;
  } catch {
    // A malformed URL shouldn't crash a tile — the component falls back to
    // showing the site's first letter instead.
    return null;
  }
}
