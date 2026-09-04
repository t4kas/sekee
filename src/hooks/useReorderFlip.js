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
 * A PROMOTION GETS A SECOND MOVEMENT ON TOP OF THE PLAIN SLIDE. Pass the
 * promoted row's key as `emergeFrom` and the rest of the list stops merely
 * shuffling down a slot: every row below starts stacked just under the
 * promoted one, blurred and transparent, and slides out to its own place one
 * after another, so the list reads as unpacking itself out of the row that
 * just won rather than as four rows independently nudging down.
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

// --- The cascade the rest of the list runs when one row is promoted -------

/** Held back just long enough for the promoted row to be visibly arriving. */
const EMERGE_LEAD = 60;
/** Gap between each row setting off, so they leave one at a time. */
const EMERGE_STAGGER = 30;
const EMERGE_DURATION = 280;
/** Where they start: this far below the promoted row's own top edge. */
const EMERGE_GAP = 10;
const EMERGE_BLUR = 5;
/** Decelerating, no overshoot — the bounce belongs to the promoted row. */
const EMERGE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Remembers `animation` as the one currently moving `key`, so a reorder that
 * lands while it's playing can cancel it and pick up where it had got to, and
 * forgets it again once it's over.
 */
function track(registry, key, animation) {
  registry.current.set(key, animation);
  const forget = () => {
    if (registry.current.get(key) === animation) registry.current.delete(key);
  };
  animation.finished.then(forget, forget); // rejects when cancelled; same cleanup
}

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

/**
 * @param {{ current: HTMLElement | null }} containerRef
 * @param {{ emergeFrom?: string | null }} [options] `emergeFrom` names the row
 *   the rest of the list should look like it came out of — see the cascade in
 *   the file header. It only takes effect on the render where that row
 *   actually arrives at the top, so it can be passed for as long as the row
 *   leads without re-firing on every later reshuffle.
 */
export function useReorderFlip(containerRef, { emergeFrom = null } = {}) {
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

    const rows = [...container.querySelectorAll('[data-flip-key]')];
    const keys = rows.map((row) => row.dataset.flipKey);
    // Measured up front: the cascade below positions every row relative to
    // the leader's, so they all have to be known before anything is animated.
    const rowTops = rows.map((row) => row.offsetTop);
    const tops = new Map(keys.map((key, index) => [key, rowTops[index]]));

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // A promotion, specifically: the named row is now leading *and* got there
    // by moving up on this render. An ordinary reshuffle underneath a row
    // that was already leading is left to the plain slide below.
    const leaderPreviousTop = previousTops.current.get(keys[0]);
    const promoted =
      !reduceMotion &&
      emergeFrom != null &&
      keys[0] === emergeFrom &&
      leaderPreviousTop !== undefined &&
      leaderPreviousTop - rowTops[0] > MIN_TRAVEL;

    rows.forEach((element, index) => {
      const key = keys[index];
      const top = rowTops[index];

      // No previous position means the row is new — it has its own entrance
      // animation, and nowhere to have travelled from.
      const previousTop = previousTops.current.get(key);
      if (previousTop === undefined || reduceMotion) return;

      const inFlight = moving.current.get(key);

      // Everything below a promoted row fans out from underneath it instead
      // of shuffling down a slot: it starts stacked just under the leader,
      // blurred and invisible, then slides to its own place. Staggered, so
      // they leave one at a time. Starting from `opacity: 0` is what lets
      // them begin somewhere they never actually were — there is nothing on
      // screen to jump when they take up the stacked position.
      if (promoted && index > 0) {
        inFlight?.cancel();
        const emerge = element.animate(
          [
            {
              transform: `translateY(${(rowTops[0] + EMERGE_GAP - top).toFixed(1)}px)`,
              filter: `blur(${EMERGE_BLUR}px)`,
              opacity: 0,
            },
            { transform: 'translateY(0)', filter: 'blur(0px)', opacity: 1 },
          ],
          {
            duration: EMERGE_DURATION,
            delay: EMERGE_LEAD + (index - 1) * EMERGE_STAGGER,
            easing: EMERGE_EASING,
            // Holds the stacked, invisible start through the delay. Without
            // it a waiting row would sit in its final place and then jump
            // back up to start.
            fill: 'backwards',
          },
        );
        track(moving, key, emerge);
        return;
      }

      const travel = previousTop - top;
      if (Math.abs(travel) < MIN_TRAVEL) return;

      // A second reorder can land while the first is still playing. Carrying
      // over how far that one had got keeps the row moving on from where it
      // visibly is, instead of snapping back to its old layout position.
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

      track(moving, key, move);
    });

    // Rows that have left the list will never resolve their `finished`
    // handler, so drop them here rather than growing the map forever.
    for (const stale of moving.current.keys()) {
      if (!tops.has(stale)) moving.current.delete(stale);
    }

    previousTops.current = tops;
  });
}
