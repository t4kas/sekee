/**
 * SearchGlow
 * ---------------------------------------------------------------------------
 * A thin, colored ring that hugs its child's rounded corners and lights up
 * near wherever the pointer is, only while `focusActive` is true. This
 * started as a vendored ReactBits component (`BorderGlow`) but every one of
 * its CSS building blocks turned out to fight this app's actual needs:
 *
 * - Its "gradient border" trick relies on painting an opaque fill behind the
 *   gradient to punch out the interior — that fill bled through `.frame`'s
 *   translucent focused background instead of staying hidden.
 * - The geometric fix for that (`mask-composite: exclude`/`intersect`)
 *   turned out not to work at all in testing — those operators didn't
 *   composite, leaving the whole interior filled again.
 * - `border-image` (the fix after that) paints correctly but does not
 *   respect `border-radius` — its corners are mitred square, not rounded,
 *   which is visibly wrong on a 25px pill.
 *
 * All three are CSS trying to fake a shape it isn't well suited to. SVG
 * actually has that shape, so this strokes a real rounded-rectangle `<path>`
 * instead of simulating one out of backgrounds and masks.
 *
 * IT MIRRORS ITS CHILD'S GEOMETRY RATHER THAN BEING TOLD IT. The child here
 * (`.frame` in SearchBar) changes shape as you use it: it grows to wrap the
 * suggestions dropdown, and its bottom corners relax from 25px to
 * `--radius-lg` when they do. So instead of taking a `borderRadius` prop
 * that would immediately go stale, `measure` reads the child's own computed
 * corner radii (all four, independently) and box size on every
 * ResizeObserver tick, and the ring is rebuilt from those — the ring hugs
 * whatever the child currently is, dropdown open or closed. That measured
 * height also bounds the spotlight (see `moveSpotlight`), which is what
 * keeps the glow off both long edges at once on the collapsed bar without
 * having to narrow it. Note this all makes the child's own box the thing
 * being drawn around, so the wrapper must not add padding or a transform of
 * its own that the child doesn't share.
 *
 * PROXIMITY, NOT "EDGE SENSITIVITY": the vendored version measured how close
 * the pointer was to the card's own edge, so it never reacted until the
 * pointer was already over the card. This tracks the pointer globally
 * (window, not the card) and fades in over `proximityRange` pixels as it
 * approaches from *outside* the card too — a search bar this small benefits
 * from the glow anticipating the pointer rather than only reacting once it
 * arrives.
 *
 * Every per-frame update writes straight to the DOM via refs rather than
 * through React state, the same reason the vendored version did:
 * `pointermove` and the intro sweep both fire far too often to re-render on.
 */
import { useEffect, useId, useRef, useState } from 'react';

function easeOutCubic(x) {
  return 1 - (1 - x) ** 3;
}
function easeInCubic(x) {
  return x ** 3;
}
function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
}

function animateValue({ start = 0, end = 1, duration = 1000, delay = 0, ease = easeOutCubic, onUpdate, onEnd }) {
  const t0 = performance.now() + delay;
  function tick() {
    const elapsed = performance.now() - t0;
    if (elapsed < 0) {
      requestAnimationFrame(tick);
      return;
    }
    const t = Math.min(elapsed / duration, 1);
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else onEnd?.();
  }
  requestAnimationFrame(tick);
}

/** The four corner radii of `el`, in CSS shorthand order. */
function readRadii(el) {
  const style = getComputedStyle(el);
  return [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map((value) => {
    const radius = parseFloat(value);
    return Number.isFinite(radius) ? radius : 0;
  });
}

/**
 * A rounded-rectangle outline as SVG path data, inset by `inset` on every
 * side. `inset` is half the stroke width, so that a stroke centred on this
 * path has its *outer* edge exactly on the box — which is what makes the
 * ring sit on the child's edge rather than floating inside it. The corner
 * radii shrink by the same amount for the same reason.
 */
function roundedRectPath(width, height, radii, inset) {
  const w = width - inset * 2;
  const h = height - inset * 2;
  if (w <= 0 || h <= 0) return '';

  const limit = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r - inset, limit)));
  const x = inset;
  const y = inset;

  return [
    `M ${x + tl} ${y}`,
    `H ${x + w - tr}`,
    tr && `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}`,
    `V ${y + h - br}`,
    br && `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}`,
    `H ${x + bl}`,
    bl && `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}`,
    `V ${y + tl}`,
    tl && `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}`,
    'Z',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Walks the box's perimeter: `t` of 0 is top-centre, 1 is all the way back
 * round clockwise. Used only by the intro sweep — travelling the perimeter
 * (rather than sweeping an angle from the centre) is what keeps the sweep at
 * an even speed on a box this much wider than it is tall.
 */
function pointOnPerimeter(t, width, height) {
  const perimeter = 2 * (width + height);
  let distance = (((t % 1) + 1) % 1) * perimeter + width / 2;
  distance %= perimeter;

  if (distance < width) return [distance, 0];
  distance -= width;
  if (distance < height) return [width, distance];
  distance -= height;
  if (distance < width) return [width - distance, height];
  return [0, height - (distance - width)];
}

const SearchGlow = ({
  children,
  className = '',
  focusActive = false,
  ringWidth = 2.5,
  glowWidth = 13,
  blurStdDeviation = 4,
  spotlightSpread = 150,
  proximityRange = 90,
  introDuration = 1500,
  colors = ['#7cc0ff', '#93c5fd', '#38bdf8'],
}) => {
  const wrapRef = useRef(null);
  const spotRef = useRef(null);
  const focusRef = useRef(focusActive);
  const cancelIntroRef = useRef(null);
  const introPlayingRef = useRef(false);
  const lastPointRef = useRef(null);
  const spotPointRef = useRef({ x: 0, y: 0 });
  const gradientId = useId();

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [radii, setRadii] = useState([0, 0, 0, 0]);

  useEffect(() => {
    focusRef.current = focusActive;
  }, [focusActive]);

  // Tracks the child's box and corner radii — see the file header on why
  // they're read rather than passed in.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    const measure = () => {
      const width = wrap.offsetWidth;
      const height = wrap.offsetHeight;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));

      const target = wrap.firstElementChild;
      if (!target) return;
      const next = readRadii(target);
      setRadii((prev) => (prev.every((value, i) => value === next[i]) ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // How far the spotlight is squashed depends on the box's height, so a box
  // that grows under a stationary pointer — exactly what happens when the
  // suggestions open while you type — would otherwise keep the collapsed
  // bar's squash until the mouse next moved.
  useEffect(() => {
    const last = lastPointRef.current;
    if (last && focusRef.current && !introPlayingRef.current) applyPoint(last.x, last.y);
    else moveSpotlight(spotPointRef.current.x, spotPointRef.current.y, size.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, spotlightSpread]);

  /**
   * Puts the spotlight at (`x`, `y`) in the box's own coordinates, squashed
   * to an ellipse that can't reach across the box vertically.
   *
   * WHY AN ELLIPSE AND NOT A CIRCLE. Two things are wanted at once: a long
   * lit stretch of ring, and nothing at all on the opposite edge. A circle
   * can't do both on the collapsed bar — it's only ~68px tall, so a radius
   * big enough to light a wide stretch of the top edge also reaches the
   * bottom one from anywhere inside, and shrinking it until it can't takes
   * the width away with it. The two demands are really about different
   * axes, so they get separate radii: `spotlightSpread` horizontally (how
   * much of the edge lights up, unchanged whether collapsed or expanded),
   * and at most half the box's height vertically, which is the exact
   * condition for the pointer's two distances to the long edges — they
   * always sum to the full height — never both falling inside it.
   *
   * SVG gradients are circular, so the ellipse comes from `gradientTransform`
   * scaling the y axis about the spotlight itself. The `translate` is what
   * pins it there: scaling alone would drag the centre toward the top of the
   * box as it squashed.
   */
  function moveSpotlight(x, y, boxHeight) {
    const spot = spotRef.current;
    if (!spot) return;

    spotPointRef.current = { x, y };
    const squash = boxHeight > 0 ? Math.min(spotlightSpread, boxHeight / 2) / spotlightSpread : 1;

    spot.setAttribute('cx', x.toFixed(1));
    spot.setAttribute('cy', y.toFixed(1));
    spot.setAttribute(
      'gradientTransform',
      `translate(0 ${(y * (1 - squash)).toFixed(2)}) scale(1 ${squash.toFixed(4)})`,
    );
  }

  /**
   * Sets `--glow-proximity` from the pointer's distance to the box (1 at or
   * inside its edge, 0 once `proximityRange` past it) and puts the spotlight
   * at the pointer itself, clamped into the box. Clamping — rather than
   * projecting an angle from the centre — is deliberate: an angle from the
   * centre swings through a half-turn for a few pixels of pointer movement
   * near the middle, which reads as the glow darting across the bar. Clamped,
   * the spotlight tracks the pointer one-to-one and simply lights whichever
   * stretch of the ring it's nearest.
   */
  function applyPoint(clientX, clientY) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();

    const dx = Math.max(rect.left - clientX, clientX - rect.right, 0);
    const dy = Math.max(rect.top - clientY, clientY - rect.bottom, 0);
    const proximity = Math.max(0, Math.min(1, 1 - Math.hypot(dx, dy) / proximityRange));
    wrap.style.setProperty('--glow-proximity', proximity.toFixed(3));

    moveSpotlight(
      Math.max(0, Math.min(rect.width, clientX - rect.left)),
      Math.max(0, Math.min(rect.height, clientY - rect.top)),
      rect.height,
    );
  }

  // One listener for the life of the component: it records the pointer even
  // while unfocused (so a focus that arrives from the keyboard, with the
  // mouse already resting on the bar, still settles to the right brightness)
  // and only paints while focused.
  //
  // It deliberately does NOT interrupt the intro sweep. Letting the pointer
  // take over on sight sounds more responsive, but focusing the bar is
  // usually a *click* — which moves the pointer onto the bar, cancelling the
  // sweep before it's visibly started. The starting animation is the point,
  // so for its ~1.5s it owns the glow; `lastPointRef` keeps recording
  // underneath, and `settle` hands straight over to it at the end.
  useEffect(() => {
    const handleMove = (event) => {
      lastPointRef.current = { x: event.clientX, y: event.clientY };
      if (!focusRef.current || introPlayingRef.current) return;
      applyPoint(event.clientX, event.clientY);
    };

    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proximityRange]);

  // The starting animation: on focus the spotlight travels once around the
  // whole ring, brightening as it sets off and fading as it lands, then
  // hands over to the pointer. Blur just clears `--glow-proximity` — the
  // CSS transition below is what makes that a fade rather than a cut.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    if (!focusActive) {
      cancelIntroRef.current?.();
      cancelIntroRef.current = null;
      introPlayingRef.current = false;
      wrap.style.setProperty('--glow-proximity', '0');
      return undefined;
    }

    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      introPlayingRef.current = false;
    };
    cancelIntroRef.current = cancel;
    introPlayingRef.current = true;

    /** Hands the glow back to wherever the pointer actually is. */
    const settle = () => {
      if (cancelled) return;
      cancelIntroRef.current = null;
      introPlayingRef.current = false;
      const last = lastPointRef.current;
      if (last) applyPoint(last.x, last.y);
      else wrap.style.setProperty('--glow-proximity', '0');
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settle();
      return cancel;
    }

    const width = wrap.offsetWidth;
    const height = wrap.offsetHeight;
    const fadeDuration = 420;

    moveSpotlight(...pointOnPerimeter(0, width, height), height);
    animateValue({
      duration: introDuration,
      ease: easeInOutCubic,
      onUpdate: (t) => {
        if (!cancelled) moveSpotlight(...pointOnPerimeter(t, width, height), height);
      },
    });
    animateValue({
      duration: 280,
      onUpdate: (v) => {
        if (!cancelled) wrap.style.setProperty('--glow-proximity', v.toFixed(3));
      },
    });
    animateValue({
      delay: introDuration - fadeDuration,
      duration: fadeDuration,
      start: 1,
      end: 0,
      ease: easeInCubic,
      onUpdate: (v) => {
        if (!cancelled) wrap.style.setProperty('--glow-proximity', v.toFixed(3));
      },
      onEnd: settle,
    });

    return cancel;
  }, [focusActive, introDuration]);

  const { width, height } = size;
  const outline = roundedRectPath(width, height, radii, ringWidth / 2);
  const clipRadius = radii.map((r) => `${r}px`).join(' ');

  // The gradient's own radius is the *horizontal* one — the same whether
  // collapsed or expanded, so the lit stretch of edge is as long either way.
  // `moveSpotlight` is what squashes it vertically per the box's height; it
  // only needs capping here for a box narrower than the spread, so that the
  // left and right edges can't both light for the same reason the top and
  // bottom can't.
  const spotlightRadius = width > 0 ? Math.min(spotlightSpread, width / 2) : spotlightSpread;

  return (
    <div ref={wrapRef} className={className} style={{ position: 'relative' }}>
      {children}
      {/* `overflow: hidden` keeps the glow — ring and blur alike — from ever
          spilling past the child's own rounded edge onto the page. The blur
          is centred on the ring, so clipping it here is also what turns the
          outer half of that bloom into light stopping at the edge rather
          than a halo cast around the whole control. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: clipRadius,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {outline && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ opacity: 'var(--glow-proximity, 0)', transition: 'opacity 0.3s ease-out' }}
          >
            <defs>
              <radialGradient ref={spotRef} id={gradientId} gradientUnits="userSpaceOnUse" r={spotlightRadius}>
                <stop offset="0%" stopColor={colors[0]} stopOpacity="1" />
                <stop offset="35%" stopColor={colors[1] ?? colors[0]} stopOpacity="0.75" />
                <stop offset="70%" stopColor={colors[2] ?? colors[0]} stopOpacity="0.25" />
                <stop offset="100%" stopColor={colors[2] ?? colors[0]} stopOpacity="0" />
              </radialGradient>
              <filter id={`${gradientId}-blur`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={blurStdDeviation} />
              </filter>
            </defs>
            {/* Soft bloom, then a crisp core on top — the standard two-pass
                "neon line" technique: one blurred stroke on its own just
                looks smeared rather than lit. */}
            <path
              d={outline}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={glowWidth}
              filter={`url(#${gradientId}-blur)`}
            />
            <path d={outline} fill="none" stroke={`url(#${gradientId})`} strokeWidth={ringWidth} />
          </svg>
        )}
      </div>
    </div>
  );
};

export default SearchGlow;
