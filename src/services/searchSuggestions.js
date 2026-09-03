/**
 * Search suggestions
 * ---------------------------------------------------------------------------
 * Fetches the autofill dropdown shown under the search bar while typing — the
 * same list Google's own search box shows.
 *
 * WHY JSONP INSTEAD OF `fetch`: Google's suggest endpoint
 * (suggestqueries.google.com/complete/search) doesn't send
 * `Access-Control-Allow-Origin`, so a `fetch`/`XHR` call to it is blocked by
 * the browser's CORS check before the response body is ever readable. A
 * `<script>` tag isn't subject to that check — script loading predates
 * CORS — so we ask for the JSONP form (`callback=`) and let the browser
 * execute the response as a script that calls back into this module. This is
 * the same technique Google's own `client=chrome` param exists for.
 *
 * There's no backend here to proxy the request through instead (see
 * CLAUDE.md's "no backend" architecture note), so this is the only way to
 * reach the endpoint from a static page at all.
 */

import { getEngine } from './searchEngines.js';

const SUGGEST_ENDPOINT = 'https://suggestqueries.google.com/complete/search';

/** Bounds how long a suggestion request can hang before we give up on it —
 *  a slow/broken script load would otherwise never resolve or reject. */
const TIMEOUT_MS = 4000;

/** Google's endpoint doesn't take a count param, so trim its response
 *  ourselves — a dropdown longer than this crowds the bookmarks below it. */
const MAX_SUGGESTIONS = 6;

let callbackSequence = 0;

/**
 * Loads `url` as a JSONP request: appends `callback=<name>`, injects a
 * `<script>` tag, and resolves with whatever value that callback is called
 * with. Cleans up the script tag and the global callback either way.
 *
 * @param {string} url
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<unknown>}
 */
function jsonpRequest(url, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__sekeeSuggest${callbackSequence++}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const onAbort = () => settle(reject, new DOMException('Aborted', 'AbortError'));
    const timeoutId = setTimeout(() => settle(reject, new Error('Suggestion request timed out')), TIMEOUT_MS);

    window[callbackName] = (data) => settle(resolve, data);
    script.onerror = () => settle(reject, new Error('Suggestion request failed to load'));
    signal?.addEventListener('abort', onAbort);

    const separator = url.includes('?') ? '&' : '?';
    script.src = `${url}${separator}callback=${callbackName}`;
    document.head.appendChild(script);
  });
}

/** @param {string} engineId */
export function supportsSuggestions(engineId) {
  return Boolean(getEngine(engineId).suggest);
}

/**
 * Fetches autofill suggestions for a partial query.
 *
 * Never throws: a request that fails, times out, or is aborted resolves to
 * an empty list instead — the dropdown just stays closed. An `AbortError`
 * (the caller cancelled because the query changed again) is the one case
 * worth distinguishing, so it's re-thrown for the caller to ignore.
 *
 * @param {string} engineId
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<string[]>}
 */
export async function fetchSuggestions(engineId, query, { signal } = {}) {
  const trimmed = query.trim();
  if (!trimmed || !supportsSuggestions(engineId)) return [];

  const params = new URLSearchParams({ client: 'chrome', q: trimmed });

  try {
    // Response shape: [query, [suggestion, ...], [...], {...}]
    const data = await jsonpRequest(`${SUGGEST_ENDPOINT}?${params}`, { signal });
    if (!Array.isArray(data?.[1])) return [];
    return data[1].filter((item) => typeof item === 'string').slice(0, MAX_SUGGESTIONS);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.warn('[searchSuggestions] falling back to no suggestions:', error.message);
    return [];
  }
}
