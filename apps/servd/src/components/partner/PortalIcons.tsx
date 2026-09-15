/**
 * Sidebar icons, drawn here.
 *
 * Eight glyphs on a 24 grid, 1.7 stroke, round caps, all inheriting
 * `currentColor` so one class tints a whole row. No icon package: the brief for
 * canvexia.com said to ask before adding a dependency, and eight paths are not
 * worth one.
 */
type P = { size?: number; className?: string };

function Svg({ size = 20, className = "", children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconGrid = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
  </Svg>
);

export const IconFunnel = (p: P) => (
  <Svg {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
  </Svg>
);

export const IconStore = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 9.5 5 4.5h14l1.5 5M4.5 9.5v10h15v-10" />
    <path d="M3.5 9.5a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0" />
    <path d="M10 19.5v-5h4v5" />
  </Svg>
);

export const IconWallet = (p: P) => (
  <Svg {...p}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3" />
    <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
    <circle cx="16.5" cy="13.5" r="1.3" />
  </Svg>
);

export const IconPalette = (p: P) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.6-1.2-1.7-1.2-2.8 0-.8.7-1.4 1.6-1.4H16a5 5 0 0 0 5-5c0-4-4-7-9-7Z" />
    <circle cx="7.8" cy="11" r="1" />
    <circle cx="11" cy="7.6" r="1" />
    <circle cx="15.4" cy="9.2" r="1" />
  </Svg>
);

export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5S15.5 16.7 15.5 20" />
    <path d="M16.5 5.2a3.4 3.4 0 0 1 0 5.6M18 14.9c2.1.7 3.5 2.4 3.5 5.1" />
  </Svg>
);

export const IconGear = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 18.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.3 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
);

export const IconGlobe = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9S14.4 18.4 12 21c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3Z" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.5 16.5 4 4" />
  </Svg>
);

export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </Svg>
);
