/**
 * Weather icons
 * ---------------------------------------------------------------------------
 * Small inline SVGs for the widget's condition glyph, one per bucket
 * `weatherService.getWeatherCondition` can return. Built with the same
 * approach as `src/components/ui/icons.jsx` (1.75px stroke, `currentColor`,
 * 24px grid, `aria-hidden`) but kept local to this widget rather than added
 * to that shared file, since nothing else in the app needs a snowflake or a
 * lightning bolt.
 */

/** Shared props, matching `ui/icons.jsx`'s `Svg` helper. */
function Svg({ children, size = 18, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** The cloud outline every condition but "clear" builds on. */
function CloudShape(props) {
  return <path d="M6.5 17.5a3.6 3.6 0 0 1 .3-7.18A5 5 0 0 1 16.9 8.9a3.6 3.6 0 0 1-.5 8.6H6.5Z" {...props} />;
}

const ClearIcon = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.64 5.64l1.42 1.42M16.94 16.94l1.42 1.42M5.64 18.36l1.42-1.42M16.94 7.06l1.42-1.42" />
  </Svg>
);

const CloudyIcon = (props) => (
  <Svg {...props}>
    <circle cx="7.5" cy="7.5" r="2.6" />
    <CloudShape />
  </Svg>
);

const OvercastIcon = (props) => (
  <Svg {...props}>
    <CloudShape />
  </Svg>
);

const FogIcon = (props) => (
  <Svg {...props}>
    <CloudShape />
    <path d="M4 19.5h16M6.5 22h11" />
  </Svg>
);

const DrizzleIcon = (props) => (
  <Svg {...props}>
    <CloudShape />
    <path d="M8.5 19.5v1.2M12 19.5v1.2M15.5 19.5v1.2" />
  </Svg>
);

const RainIcon = (props) => (
  <Svg {...props}>
    <CloudShape />
    <path d="M8.5 19l-1 3M12 19l-1 3M15.5 19l-1 3" />
  </Svg>
);

const SnowIcon = (props) => (
  <Svg {...props}>
    <CloudShape />
    {/* Zero-length segments with a round linecap render as dots. */}
    <path d="M8.5 19.3v.01M12 19.3v.01M15.5 19.3v.01M8.5 22v.01M12 22v.01M15.5 22v.01" />
  </Svg>
);

const ThunderstormIcon = (props) => (
  <Svg {...props}>
    <CloudShape />
    <path d="M12.8 17.8 10.6 21h2.1l-1.3 3 3.9-4.4h-2.1l1.3-1.8Z" fill="currentColor" stroke="none" />
  </Svg>
);

/** Keyed to match `weatherService.getWeatherCondition`'s `icon` field. */
export const WEATHER_ICONS = {
  clear: ClearIcon,
  cloudy: CloudyIcon,
  overcast: OvercastIcon,
  fog: FogIcon,
  drizzle: DrizzleIcon,
  rain: RainIcon,
  snow: SnowIcon,
  thunderstorm: ThunderstormIcon,
};
