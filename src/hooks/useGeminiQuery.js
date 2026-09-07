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
 *
 * TYPING ANIMATION: `askGemini` is a single non-streaming request — the full
 * answer arrives at once. Rather than switching to Gemini's streaming
 * endpoint (real token-by-token, but SSE-parsing complexity and a new place
 * for a request to fail), `status: 'typing'` simulates one: `displayedAnswer`
 * grows toward the already-fetched full text on an interval, chunk size
 * scaled to length so a long answer still finishes in roughly a fixed
 * window rather than taking proportionally longer. Skipped entirely under
 * `prefers-reduced-motion: reduce`, matching every other animation in this
 * app (see `tokens.css`'s zeroed `--duration-*` under that media query) —
 * here that means jumping straight to `'ready'` with the full text already
 * in place, since JS timers can't be silenced by CSS alone.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { askGemini } from '../services/geminiService.js';

/** However long the answer, the typewriter finishes within roughly this
 *  many ticks — long answers reveal in bigger chunks rather than taking
 *  proportionally longer to finish. */
const REVEAL_TICKS = 120;
const REVEAL_INTERVAL_MS = 20;

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * @returns {{
 *   status: 'idle' | 'loading' | 'typing' | 'ready' | 'error',
 *   displayedAnswer: string | null,
 *   model: string | null,
 *   errorMessage: string | null,
 *   ask: (prompt: string, apiKey: string) => void,
 *   reset: () => void,
 * }}
 */
export function useGeminiQuery() {
  const [status, setStatus] = useState('idle');
  const [displayedAnswer, setDisplayedAnswer] = useState(null);
  const [model, setModel] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const controllerRef = useRef(null);
  const revealTimerRef = useRef(null);

  const stopReveal = useCallback(() => {
    clearInterval(revealTimerRef.current);
    revealTimerRef.current = null;
  }, []);

  // Aborts any in-flight request/reveal left over from a query started but
  // not yet resolved when the search bar itself unmounts.
  useEffect(() => () => {
    controllerRef.current?.abort();
    stopReveal();
  }, [stopReveal]);

  const ask = useCallback((prompt, apiKey) => {
    controllerRef.current?.abort();
    stopReveal();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setDisplayedAnswer(null);
    setModel(null);
    setErrorMessage(null);

    askGemini(prompt, apiKey, { signal: controller.signal })
      .then(({ text, model: answerModel }) => {
        if (controller.signal.aborted) return;
        setModel(answerModel);

        if (prefersReducedMotion()) {
          setDisplayedAnswer(text);
          setStatus('ready');
          return;
        }

        setStatus('typing');
        const chunkSize = Math.max(1, Math.ceil(text.length / REVEAL_TICKS));
        let shown = 0;

        revealTimerRef.current = setInterval(() => {
          shown = Math.min(text.length, shown + chunkSize);
          setDisplayedAnswer(text.slice(0, shown));

          if (shown >= text.length) {
            stopReveal();
            setStatus('ready');
          }
        }, REVEAL_INTERVAL_MS);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return; // superseded by a newer ask()
        setErrorMessage(error.message);
        setStatus('error');
      });
  }, [stopReveal]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    stopReveal();
    setStatus('idle');
    setDisplayedAnswer(null);
    setModel(null);
    setErrorMessage(null);
  }, [stopReveal]);

  return { status, displayedAnswer, model, errorMessage, ask, reset };
}
