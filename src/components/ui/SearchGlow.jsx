/**
 * SearchGlow
 * ---------------------------------------------------------------------------
 * A thin, colored ring that hugs `children`'s rounded corners and lights up
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
 * actually has that shape: a `<rect>` with `rx`/`ry` strokes a *precise*
 * rounded-rectangle outline, so this draws the ring as real SVG instead of
 * simulating one out of backgrounds and masks.
 *
 * PROXIMITY, NOT "EDGE SENSITIVITY": the vendored version measured how close
 * the pointer was to the card's own edge, so it never reacted until the
 * pointer was already over the card. This tracks the pointer globally
 * (window, not the card) whenever `focusActive`, and fades in over
 * `proximityRange` pixels as the pointer approaches the card from *outside*
 * it too — a search bar this small benefits from the glow anticipating the
 * pointer rather than only reacting once it arrives.
 *
 * Every per-frame update (`applyPoint`) writes straight to the DOM via refs
 * rather than through React state, the same reason the vendored version did:
 * `pointermove` fires far too often to run a React re-render on.
 */
import { useEffect, useId, useRef, useState } from 'react';

function easeOutCubic(x) {
  return 1 - (1 - x) ** 3;
}

function animateValue({ start = 0, end = 1, duration = 1000, ease = easeOutCubic, onUpdate, onEnd }) {
  const t0 = performance.now();
  function tick() {
    const t = Math.min((performance.now() - t0) / duration, 1);
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else onEnd?.();
  }
  requestAnimationFrame(tick);
}

const SearchGlow = ({
  children,
  className = '',
  focusActive = false,
  borderRadius = 25,
  ringWidth = 1.5,
  glowRingWidth = 8,
  blurStdDeviation = 3,
  spotlightRadius = 90,
  proximityRange = 90,
  colors = ['#7cc0ff', '#93c5fd', '#38bdf8'],
}) => {
  const wrapRef = useRef(null);
  const spotRef = useRef(null);
  const gradientId = useId();
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Tracks `children`'s actual rendered box — the ring has to redraw when it
  // does, notably `.frame` growing to fit the suggestions dropdown.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Moves the spotlight to (roughly) the point on the ring nearest the
   *  pointer, and sets `--glow-proximity` from the pointer's distance to the
   *  card — 1 at/inside the card's edge, fading to 0 at `proximityRange`
   *  past it. The spotlight's own position only needs to be *roughly* right
   *  (it's a soft, ~90px-radius gradient, not a precise marker), so it's
   *  placed via the card's bounding ellipse rather than exact rounded-rect
   *  geometry — cheap, and close enough that the blur hides the difference. */
  function applyPoint(clientX, clientY) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const dx = Math.max(rect.left - clientX, clientX - rect.right, 0);
    const dy = Math.max(rect.top - clientY, clientY - rect.bottom, 0);
    const distance = Math.hypot(dx, dy);
    const proximity = Math.max(0, Math.min(1, 1 - distance / proximityRange));
    el.style.setProperty('--glow-proximity', proximity.toFixed(3));

    const hw = rect.width / 2;
    const hh = rect.height / 2;
    const angle = Math.atan2(clientY - (rect.top + hh), clientX - (rect.left + hw));
    spotRef.current?.setAttribute('cx', (hw + hw * Math.cos(angle)).toFixed(1));
    spotRef.current?.setAttribute('cy', (hh + hh * Math.sin(angle)).toFixed(1));
  }

  useEffect(() => {
    if (!focusActive) return undefined;
    const handleMove = (event) => applyPoint(event.clientX, event.clientY);
    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusActive, proximityRange]);

  // On focus gained: a brief top-down sweep so the glow announces itself
  // even before the pointer moves. On blur: proximity snaps to 0 straight
  // away — CSS's own `transition` on opacity (below) is what makes that a
  // fade rather than a cut, so there's nothing to animate here.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;

    if (!focusActive) {
      el.style.setProperty('--glow-proximity', '0');
      return undefined;
    }

    const rect = el.getBoundingClientRect();
    spotRef.current?.setAttribute('cx', String(rect.width / 2));
    spotRef.current?.setAttribute('cy', '0');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--glow-proximity', '1');
      return undefined;
    }

    let cancelled = false;
    animateValue({
      duration: 700,
      onUpdate: (v) => {
        if (!cancelled) el.style.setProperty('--glow-proximity', v.toFixed(3));
      },
      onEnd: () => {
        if (!cancelled) el.style.setProperty('--glow-proximity', '0');
      },
    });
    return () => {
      cancelled = true;
    };
  }, [focusActive]);

  const { width, height } = size;
  const inset = Math.max(ringWidth, glowRingWidth) / 2;
  const rx = Math.max(borderRadius - ringWidth / 2, 0);
  const gradientStops = [...colors, colors[0]];

  return (
    <div ref={wrapRef} className={className} style={{ position: 'relative' }}>
      {children}
      {/* `overflow: hidden` is what keeps the glow — ring and blur alike —
          from ever spilling past `children`'s own rounded edge onto the
          page, the same requirement that made `.frame`'s translucency such
          a problem for the earlier CSS-only attempts above. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {width > 0 && height > 0 && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ opacity: 'var(--glow-proximity, 0)', transition: 'opacity 0.3s ease-out' }}
          >
            <defs>
              <radialGradient ref={spotRef} id={gradientId} gradientUnits="userSpaceOnUse" r={spotlightRadius}>
                {gradientStops.map((color, i) => (
                  <stop
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    offset={`${(i / (gradientStops.length - 1)) * 100}%`}
                    stopColor={color}
                    stopOpacity={i === gradientStops.length - 1 ? 0 : 1}
                  />
                ))}
              </radialGradient>
              <filter id={`${gradientId}-blur`} x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation={blurStdDeviation} />
              </filter>
            </defs>
            {/* Soft bloom, then a crisp core on top — the standard two-pass
                "neon line" technique: a single stroke with a blur filter just
                looks smeared, not glowing. */}
            <rect
              x={inset}
              y={inset}
              width={width - inset * 2}
              height={height - inset * 2}
              rx={rx}
              ry={rx}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={glowRingWidth}
              filter={`url(#${gradientId}-blur)`}
            />
            <rect
              x={inset}
              y={inset}
              width={width - inset * 2}
              height={height - inset * 2}
              rx={rx}
              ry={rx}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={ringWidth}
            />
          </svg>
        )}
      </div>
    </div>
  );
};

export default SearchGlow;
