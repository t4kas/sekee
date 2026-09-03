/**
 * Search engines
 * ---------------------------------------------------------------------------
 * The list the settings popover offers, and the function that turns a query
 * into a URL. Adding an engine is a one-object change — nothing else in the
 * app needs to know.
 *
 * `queryUrl` is the search endpoint; the query is appended, URL-encoded.
 */

export const SEARCH_ENGINES = [
  { id: 'google', name: 'Google', queryUrl: 'https://www.google.com/search?q=' },
  { id: 'duckduckgo', name: 'DuckDuckGo', queryUrl: 'https://duckduckgo.com/?q=' },
  { id: 'bing', name: 'Bing', queryUrl: 'https://www.bing.com/search?q=' },
  { id: 'brave', name: 'Brave', queryUrl: 'https://search.brave.com/search?q=' },
];

export const DEFAULT_ENGINE_ID = 'google';

/** Looks up an engine, falling back to the default if the stored id refers
 *  to an engine that no longer exists (e.g. you removed one from the list). */
export function getEngine(engineId) {
  return (
    SEARCH_ENGINES.find((engine) => engine.id === engineId) ??
    SEARCH_ENGINES.find((engine) => engine.id === DEFAULT_ENGINE_ID)
  );
}

/**
 * Builds the URL to navigate to for a search.
 * @param {string} engineId
 * @param {string} query
 * @returns {string}
 */
export function buildSearchUrl(engineId, query) {
  const engine = getEngine(engineId);
  return engine.queryUrl + encodeURIComponent(query.trim());
}
