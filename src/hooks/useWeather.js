/**
 * useWeather
 * ---------------------------------------------------------------------------
 * Debounced current-conditions lookup for a typed location string. Debounced
 * (rather than fired on every render) so editing the "Weather location"
 * field in Settings doesn't queue up a request per keystroke — only the
 * pause after typing does, same idea as `useSearchSuggestions.js`. The delay
 * is longer than search's (500ms vs 150ms) since this is typed once in a
 * settings field rather than driving live autocomplete.
 *
 * `getCurrentWeather` never throws (see `weatherService.js`), so `status`
 * only ever reaches `'error'` for a location that's empty, unresolvable, or
 * unreachable — there's no exception path to handle here.
 */

import { useEffect, useState } from 'react';
import { getCurrentWeather } from '../services/weatherService.js';

const DEBOUNCE_MS = 500;

/**
 * @param {string} locationQuery
 * @returns {{ weather: object | null, status: 'idle' | 'loading' | 'ready' | 'error' }}
 */
export function useWeather(locationQuery) {
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const trimmed = (locationQuery ?? '').trim();
    if (!trimmed) {
      setWeather(null);
      setStatus('idle');
      return;
    }

    setStatus('loading');
    const controller = new AbortController();

    const timer = setTimeout(() => {
      getCurrentWeather(trimmed, { signal: controller.signal })
        .then((result) => {
          setWeather(result);
          setStatus(result ? 'ready' : 'error');
        })
        .catch(() => {
          // AbortError from `locationQuery` changing again — a fresher
          // effect run already owns the state.
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locationQuery]);

  return { weather, status };
}
