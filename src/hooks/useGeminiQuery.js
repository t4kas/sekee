/**
 * useGeminiQuery
 * ---------------------------------------------------------------------------
 * Submit-triggered Gemini query for the search bar's "Ask AI" mode. Unlike
 * `useWeather`/`useSearchSuggestions` this isn't debounced off a changing
 * value — there's one request per explicit submission (Enter, or the `/ai`
 * prefix), fired by calling `ask()`.
 *
 * A second `ask()` call aborts whatever's still in flight, so a fast second
 * question can't have its answer overwritten by a slower first one that
 * resolves later.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { askGemini } from '../services/geminiService.js';

/**
 * @returns {{
 *   status: 'idle' | 'loading' | 'ready' | 'error',
 *   answer: string | null,
 *   errorMessage: string | null,
 *   ask: (prompt: string, apiKey: string) => void,
 *   reset: () => void,
 * }}
 */
export function useGeminiQuery() {
  const [status, setStatus] = useState('idle');
  const [answer, setAnswer] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const controllerRef = useRef(null);

  // Aborts any in-flight request left over from a query started but not yet
  // resolved when the search bar itself unmounts.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const ask = useCallback((prompt, apiKey) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setAnswer(null);
    setErrorMessage(null);

    askGemini(prompt, apiKey, { signal: controller.signal })
      .then((text) => {
        if (controller.signal.aborted) return;
        setAnswer(text);
        setStatus('ready');
      })
      .catch((error) => {
        if (error.name === 'AbortError') return; // superseded by a newer ask()
        setErrorMessage(error.message);
        setStatus('error');
      });
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setStatus('idle');
    setAnswer(null);
    setErrorMessage(null);
  }, []);

  return { status, answer, errorMessage, ask, reset };
}
