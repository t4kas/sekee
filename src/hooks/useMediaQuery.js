/**
 * useMediaQuery
 * ---------------------------------------------------------------------------
 * Subscribes to a CSS media query from JS, for the cases where a breakpoint
 * has to change *what renders*, not just how it looks.
 *
 * Nearly everything responsive in this app is plain CSS, which is the right
 * default — the markup stays one thing and the stylesheet reshapes it. This
 * exists for the exception: SettingsModal is a tab layout on a desktop and a
 * drill-down list of pages on a phone, and those are different interaction
 * models rather than one layout in two shapes. Trying to be both at once
 * through CSS alone would mean rendering both structures and hiding one.
 *
 * Reads the match during the initial state so the first paint is already
 * correct, rather than rendering the desktop tree and swapping after an
 * effect runs.
 */
import { useEffect, useState } from 'react';

/**
 * @param {string} query a media query, e.g. '(max-width: 560px)'
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);

    // Re-read on subscribe: the viewport can have changed between the
    // initial state above and this effect running.
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}
