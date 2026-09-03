/**
 * useSearchSuggestions
 * ---------------------------------------------------------------------------
 * Debounced autofill suggestions for the search bar. Returns `[]` immediately
 * for an empty query or an engine that doesn't support suggestions, so
 * `SearchBar` never has to check `supportsSuggestions` itself.
 *
 * Debounced rather than fired on every keystroke, so a fast typist doesn't
 * queue up a request per letter — only the pause gets one.
 */

import { useEffect, useState } from 'react';
import { fetchSuggestions } from '../services/searchSuggestions.js';

const DEBOUNCE_MS = 150;

/**
 * @param {string} engineId
 * @param {string} query
 * @returns {string[]}
 */
export function useSearchSuggestions(engineId, query) {
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(() => {
      fetchSuggestions(engineId, trimmed, { signal: controller.signal })
        .then(setSuggestions)
        .catch(() => {
          // AbortError from the query changing again — a fresher effect run
          // already owns the state.
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [engineId, query]);

  return suggestions;
}
