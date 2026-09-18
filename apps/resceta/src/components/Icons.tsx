/**
 * The nav icons, hand-drawn.
 *
 * WHY NOT AN ICON LIBRARY. lucide-react is ~1.5MB installed and pulls a
 * dependency into a pharmacy till for sixteen glyphs that never change. These
 * are one stroke path each, tree-shaken by being separate exports, and they
 * render identically on a counter PC with no icon font installed.
 *
 * All drawn on a 24×24 grid with `currentColor`, so a nav item that turns white
 * on the active gradient takes its icon with it.
 */
type P = { className?: string };

function Svg({ children, className }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? "h-4 w-4 shrink-0"}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Svg>
);

export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5 1.5 5h-15S6 13 6 9Z" />
    <path d="M10.5 18a1.8 1.8 0 0 0 3 0" />
  </Svg>
);

export const IconCart = (p: P) => (
  <Svg {...p}>
    <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.1a2 2 0 0 0 2-1.5L20 7H6" />
    <circle cx="10" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </Svg>
);

export const IconReceipt = (p: P) => (
  <Svg {...p}>
    <path d="M6 2.5h12v19l-3-1.8-3 1.8-3-1.8-3 1.8Z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);

export const IconTill = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="9" width="18" height="11" rx="2" />
    <path d="M7 9V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3M10 14h4" />
  </Svg>
);

export const IconBag = (p: P) => (
  <Svg {...p}>
    <path d="M5 7h14l-1 13H6L5 7Z" />
    <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
  </Svg>
);

export const IconPill = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" />
    <path d="M9 9l6 6" />
  </Svg>
);

export const IconTruck = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 6.5h11v9h-11z" />
    <path d="M13.5 10h4l3 3v2.5h-7z" />
    <circle cx="7" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
  </Svg>
);

export const IconClipboard = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6H9Z" />
    <path d="M9 11h6M9 15h4" />
  </Svg>
);

export const IconBuilding = (p: P) => (
  <Svg {...p}>
    <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V21" />
    <path d="M13 10h5.5A1.5 1.5 0 0 1 20 11.5V21M3 21h18" />
    <path d="M7 8h2M7 12h2M7 16h2M16 14h1M16 17h1" />
  </Svg>
);

export const IconAdjust = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
);

export const IconCount = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h5M8 12h8M8 16h3" />
    <path d="M15.5 15.5l1.4 1.4 2.6-2.8" />
  </Svg>
);

export const IconSwap = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </Svg>
);

export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.6a3 3 0 0 1 0 4.8M17 14.5a5.5 5.5 0 0 1 4 5.5" />
  </Svg>
);

export const IconRx = (p: P) => (
  <Svg {...p}>
    <path d="M6 20V5h4.5a3 3 0 0 1 0 6H6" />
    <path d="M10 11l7 9M18 12l-6 8" />
  </Svg>
);

export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

export const IconWallet = (p: P) => (
  <Svg {...p}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3" />
    <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
    <circle cx="16.5" cy="14" r="1.2" />
  </Svg>
);

export const IconCard = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M2.5 10h19M6 15h4" />
  </Svg>
);

export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 16v-4M12.5 16V8M17 16v-6" />
  </Svg>
);

export const IconCog = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7.3l1.9 1.1M17.9 15.6l1.9 1.1M4.2 16.7l1.9-1.1M17.9 8.4l1.9-1.1" />
  </Svg>
);

export const IconSparkle = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l1.9 4.9L19 10l-5.1 2.1L12 17l-1.9-4.9L5 10l5.1-2.1Z" />
  </Svg>
);

export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconCoins = (p: P) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6.5" rx="7" ry="3" />
    <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    <path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  </Svg>
);

export const IconTrend = (p: P) => (
  <Svg {...p}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);

export const IconBoxes = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="12" width="8" height="8" rx="1.5" />
    <rect x="13" y="12" width="8" height="8" rx="1.5" />
    <rect x="8" y="3.5" width="8" height="8" rx="1.5" />
  </Svg>
);

export const IconWarehouse = (p: P) => (
  <Svg {...p}>
    <path d="M3 20V9l9-5 9 5v11" />
    <path d="M7 20v-6h10v6M3 20h18" />
  </Svg>
);

export const IconPiggy = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 12.5A6.5 6.5 0 0 1 10 6h3a6 6 0 0 1 5.8 4.4l2.2.8v3.3l-2 .5A6.5 6.5 0 0 1 16 18v2h-3v-1.4h-3V20H7v-2.3a6.4 6.4 0 0 1-3.5-5.2Z" />
    <path d="M9 5.5C9 4 10.2 3 12 3.3" />
    <circle cx="8" cy="12" r=".8" fill="currentColor" />
  </Svg>
);

export const IconWarning = (p: P) => (
  <Svg {...p}>
    <path d="M12 4l9 15.5H3Z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);

export const IconUserPlus = (p: P) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3.5 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M18 8.5v5M15.5 11h5" />
  </Svg>
);
