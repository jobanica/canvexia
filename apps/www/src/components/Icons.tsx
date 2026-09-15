/**
 * Line icons, drawn here.
 *
 * The reference design leans on an illustrated icon set. Rather than pull in an
 * icon package for eleven glyphs — a dependency the brief said to ask before
 * adding — these are hand-drawn strokes on a 24 grid, all 1.6 wide with round
 * caps, so they sit together as one set. No emoji: the brief ruled those out
 * and it was right, they render differently on every phone.
 *
 * Every icon inherits `currentColor`, which is what lets one component tint a
 * whole tile.
 */
type IconProps = { size?: number; className?: string };

function Svg({ size = 24, className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** One city, marked. */
export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </Svg>
);

/**
 * Recurring money. Two arcs that close a loop, which is the one recurring
 * symbol everybody already reads — the earlier drawing packed an arrow, a pipe
 * and two ledger lines into 24px and came out as a squiggle at 20.
 */
export const IconRepeat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 0 1-13.6 5.7M4 12a8 8 0 0 1 13.6-5.7" />
    <path d="M17.6 2.8v3.6h-3.6M6.4 21.2v-3.6h3.6" />
  </Svg>
);

/** No inventory: an empty box. */
export const IconBox = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
    <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
  </Svg>
);

/** Applying / a form. */
export const IconApply = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
);

/** Branding / a palette. */
export const IconBrand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.6-1.2-1.7-1.2-2.8 0-.8.7-1.4 1.6-1.4H16a5 5 0 0 0 5-5c0-4-4-7-9-7Z" />
    <circle cx="7.8" cy="11" r="1" />
    <circle cx="11" cy="7.6" r="1" />
    <circle cx="15.4" cy="9.2" r="1" />
  </Svg>
);

/**
 * Signing local businesses: a shopfront.
 *
 * It replaced a handshake drawn as two meeting arrows, which at 20px was a
 * squiggle. A shop also says the thing more directly — the work is walking into
 * one of these.
 */
export const IconHandshake = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 9.5 5 4.5h14l1.5 5" />
    <path d="M4.5 9.5v10h15v-10" />
    <path d="M3.5 9.5a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0" />
    <path d="M10 19.5v-5h4v5" />
  </Svg>
);

/** Earnings going up. */
export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V4M4 20h16" />
    <path d="m7.5 15.5 3.5-4 3 2.4L20 7" />
    <path d="M16.5 7H20v3.5" />
  </Svg>
);

/** Restaurants. */
export const IconPlate = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 11.5V21" />
    <path d="M17.5 3c-1.4 1.3-2 3-2 5s.6 2.8 2 3v10" />
  </Svg>
);

/** Pharmacy. */
export const IconPill = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.6" y="8.6" width="18.8" height="6.8" rx="3.4" transform="rotate(-45 12 12)" />
    <path d="M9.2 9.2 14.8 14.8" />
  </Svg>
);

/** Print shop. */
export const IconPrinter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9V3h10v6M7 19H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M7 15h10v6H7z" />
  </Svg>
);

/** Laundry. */
export const IconWash = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <circle cx="12" cy="14" r="4" />
    <path d="M8 6.5h.01M11 6.5h.01" />
  </Svg>
);

/** The waitlist / a person added. */
export const IconUserPlus = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 20c0-3.3 2.9-5.5 6.5-5.5S16 16.7 16 20" />
    <path d="M18.5 9v5M21 11.5h-5" />
  </Svg>
);

export const IconArrow = ({ size = 16, className = "" }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);
