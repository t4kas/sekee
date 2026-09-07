/**
 * useGeminiApiKey
 * ---------------------------------------------------------------------------
 * Reads the user's Gemini API key and stays in sync with `subscribe` — so
 * saving or clearing the key in Settings shows up in the search bar
 * immediately, without a reload. Same subscribe-on-mount shape as
 * `useSettings`, just for a single device-local string instead of a whole
 * settings object.
 */

import { useEffect, useState } from 'react';
import { getGeminiApiKey, subscribeToGeminiApiKey } from '../services/geminiService.js';

/** @returns {string} the stored key, or '' if none is set. */
export function useGeminiApiKey() {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    let isMounted = true;

    getGeminiApiKey().then((key) => {
      if (isMounted) setApiKey(key);
    });

    const unsubscribe = subscribeToGeminiApiKey((key) => {
      if (isMounted) setApiKey(key);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return apiKey;
}
