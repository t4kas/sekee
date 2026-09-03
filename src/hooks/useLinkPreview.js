/**
 * useLinkPreview
 * ---------------------------------------------------------------------------
 * Debounced title/description lookup for a URL-shaped autocomplete
 * suggestion. Returns `null` immediately for no URL, and stays `null` if the
 * fetch fails or never resolves — `fetchLinkPreview` never throws, so the
 * caller always has *something* to render (the bare hostname).
 *
 * Debounced rather than fired on every render, so a suggestion that's only
 * passing through as the user keeps typing doesn't queue up a request that's
 * immediately thrown away.
 */

import { useEffect, useState } from 'react';
import { fetchLinkPreview } from '../services/linkPreviewService.js';

const DEBOUNCE_MS = 200;

/**
 * @param {string|null} url
 * @returns {{ title: string, description: string|null } | null}
 */
export function useLinkPreview(url) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!url) {
      setPreview(null);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(() => {
      fetchLinkPreview(url, { signal: controller.signal })
        .then(setPreview)
        .catch(() => {
          // AbortError from `url` changing again — a fresher effect run
          // already owns the state.
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url]);

  return preview;
}
