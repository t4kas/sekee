/**
 * useReorderFlip
 * ---------------------------------------------------------------------------
 * Slides list items between the positions they held on the previous render
 * and the ones they hold now — the standard FLIP technique: measure both,
 * invert the difference with a transform, then play that transform out.
 *
 * It exists for the search bar's suggestions dropdown, where finishing a word
 * promotes its exact match to the top of the list (`promoteExactMatch` in
 * SearchBar.jsx). Without this, that row is simply somewhere else on the next
 * paint, and the row you were reading and the row that ends up first read as
 * two unrelated things.
 *
 * TWO REQUIREMENTS ON THE CALLER: every animatable child carries a
 * `data-flip-key` identifying it across renders, and React keys those children
 * on the same value — a row that moves has to keep its DOM node rather than
 * being torn down and rebuilt somewhere else, or there is nothing to animate.
 *
 * Positions come from `offsetTop` rather than `getBoundingClientRect`, because
 * the container is itself moving: the frame around this list grows to fit the
 * dropdown and lifts a few pixels on focus, and viewport coordinates would
 * fold all of that into every row's measurement.
 */
import { useLayoutEffect, useRef } from 'react';

/** Long enough to be followed by eye, short enough not to lag typing. */
const DURATION = 460;
/** Overshoots the target slightly before settling back — the bounce. */
const EASING = 'cubic-bezier(0.34, 1.42, 0.64, 1)';
/** Motion blur, proportional to how far the row travels, and capped. */
const BLUR_PER_PIXEL = 1 / 45;
const MAX_BLUR = 3.5;
/** Under this, a "move" is sub-pixel layout noise rather than a reorder. */
const MIN_TRAVEL = 1;

/** How far `element` is currently displaced by a transform, in px. */
function currentTranslateY(element) {
  const { transform } = getComputedStyle(element);
  if (!transform || transform === 'none') return 0;
  try {
    return new DOMMatrix(transform).m42;
  } catch {
    return 0;
  }
}

/** @param {{ current: HTMLElement | null }} containerRef */
export function useReorderFlip(containerRef) {
  const previousTops = useRef(new Map());
  const moving = useRef(new Map());

  // Deliberately runs after every render rather than keying off the list's
  // contents: rows also move for reasons that aren't reorders (the frame
  // gains padding when the search bar takes focus), and measurements left
  // stale through one of those would surface as a phantom jump on the next
  // real reorder.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tops = new Map();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (const element of container.querySelectorAll('[data-flip-key]')) {
      const key = element.dataset.flipKey;
      const top = element.offsetTop;
      tops.set(key, top);

      // No previous position means the row is new — it has its own entrance
      // animation, and nowhere to have travelled from.
      const previousTop = previousTops.current.get(key);
      if (previousTop === undefined || reduceMotion) continue;

      const travel = previousTop - top;
      if (Math.abs(travel) < MIN_TRAVEL) continue;

      // A second reorder can land while the first is still playing. Carrying
      // over how far that one had got keeps the row moving on from where it
      // visibly is, instead of snapping back to its old layout position.
      const inFlight = moving.current.get(key);
      const carried = inFlight ? currentTranslateY(element) : 0;
      inFlight?.cancel();

      const from = travel + carried;
      const blur = Math.min(Math.abs(from) * BLUR_PER_PIXEL, MAX_BLUR);

      const move = element.animate(
        [{ transform: `translateY(${from}px)` }, { transform: 'translateY(0)' }],
        { duration: DURATION, easing: EASING },
      );

      // Blur peaks early, where the row is travelling fastest, and is gone
      // before it lands — a row that settled still blurred would just read as
      // out of focus. It's a separate animation so that the overshoot in
      // `EASING` above drives only the movement: sharing one animation would
      // have the blur swell again on the way back from the overshoot.
      element.animate(
        [
          { filter: 'blur(0px)' },
          { offset: 0.3, filter: `blur(${blur.toFixed(2)}px)` },
          { filter: 'blur(0px)' },
        ],
        { duration: DURATION, easing: 'ease-out' },
      );

      moving.current.set(key, move);
      const forget = () => {
        if (moving.current.get(key) === move) moving.current.delete(key);
      };
      move.finished.then(forget, forget); // rejects when cancelled; same cleanup
    }

    // Rows that have left the list will never resolve their `finished`
    // handler, so drop them here rather than growing the map forever.
    for (const stale of moving.current.keys()) {
      if (!tops.has(stale)) moving.current.delete(stale);
    }

    previousTops.current = tops;
  });
}
