/**
 * Icons
 * ---------------------------------------------------------------------------
 * Small inline SVGs. Inlining them (rather than pulling in an icon library)
 * keeps the bundle tiny and lets them inherit `currentColor` from whatever
 * they sit inside.
 *
 * They're all decorative — the buttons around them carry the accessible name
 * — so every icon is `aria-hidden`.
 */

/** Shared props: 1.75px strokes on a 24px grid, rounded caps. `...rest` lets
 *  a call site override things like `fill` (see `HeartIcon`'s filled state)
 *  without every other icon needing to pass anything beyond `size`. */
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

export const SearchIcon = (props) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const SettingsIcon = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="3.1" />
    {/* An 8-tooth cog. The outline alternates between a tooth-top radius and
        a valley radius; `stroke-linejoin: round` on the shared <Svg> softens
        the corners just enough to match the other icons without turning the
        teeth into blobs. */}
    <path d="M10.18 3.03 L13.82 3.03 L14.04 5.56 L15.11 6.01 L17.05 4.37 L19.63 6.95 L17.99 8.89 L18.44 9.96 L20.97 10.18 L20.97 13.82 L18.44 14.04 L17.99 15.11 L19.63 17.05 L17.05 19.63 L15.11 17.99 L14.04 18.44 L13.82 20.97 L10.18 20.97 L9.96 18.44 L8.89 17.99 L6.95 19.63 L4.37 17.05 L6.01 15.11 L5.56 14.04 L3.03 13.82 L3.03 10.18 L5.56 9.96 L6.01 8.89 L4.37 6.95 L6.95 4.37 L8.89 6.01 L9.96 5.56 Z" />
  </Svg>
);

export const PlusIcon = (props) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const EditIcon = (props) => (
  <Svg {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Svg>
);

export const TrashIcon = (props) => (
  <Svg {...props}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

export const RefreshIcon = (props) => (
  <Svg {...props}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </Svg>
);

export const ChevronDownIcon = (props) => (
  <Svg {...props}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const CameraIcon = (props) => (
  <Svg {...props}>
    <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const UserIcon = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5" />
  </Svg>
);

export const LogOutIcon = (props) => (
  <Svg {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

/** @param {{filled?: boolean}} props */
export const HeartIcon = ({ filled, ...props }) => (
  <Svg {...props} {...(filled ? { fill: 'currentColor' } : {})}>
    <path d="M12 20.5s-7.5-4.6-9.8-9.1C.7 8 2.1 4.6 5.4 3.8c2-.5 4 .3 5.1 2 .3.5.6 1 .8 1.5.2-.5.5-1 .8-1.5 1.1-1.7 3.1-2.5 5.1-2 3.3.8 4.7 4.2 3.2 7.6-2.3 4.5-9.8 9.1-9.8 9.1z" />
  </Svg>
);

export const BookmarkIcon = (props) => (
  <Svg {...props}>
    <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1Z" />
  </Svg>
);

export const CloseIcon = (props) => (
  <Svg {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const CheckIcon = (props) => (
  <Svg {...props}>
    <path d="M5 12.5 10 17.5 19 7" />
  </Svg>
);

export const CloudIcon = (props) => (
  <Svg {...props}>
    <path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 9.02 4 4 0 0 0 7 18Z" />
  </Svg>
);

export const SlidersIcon = (props) => (
  <Svg {...props}>
    <path d="M4 6h8M16 6h4M4 12h4M12 12h8M4 18h11M19 18h1" />
    <circle cx="14" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Svg>
);

export const SunIcon = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" />
  </Svg>
);
