import {
  IconAdjust,
  IconBag,
  IconBell,
  IconBuilding,
  IconCalendar,
  IconCard,
  IconCart,
  IconChart,
  IconClipboard,
  IconClock,
  IconCog,
  IconCount,
  IconDashboard,
  IconPill,
  IconReceipt,
  IconRx,
  IconSwap,
  IconTill,
  IconTruck,
  IconUsers,
  IconWallet,
} from "./Icons";

/**
 * The nav's icon map, in a module of its own.
 *
 * WHY IT IS NOT IN AppShell. The sidebar is a client component (it needs the
 * current path to highlight the active item) and the shell is a server one (it
 * reads the branch cookie). A client component importing anything from the
 * shell drags `server-only` across the boundary and the build fails outright —
 * which is the correct failure, and this file is the fix rather than a
 * workaround: the icon map belongs to neither side.
 */
export const NAV_ICONS = {
  dashboard: IconDashboard,
  bell: IconBell,
  cart: IconCart,
  receipt: IconReceipt,
  till: IconTill,
  bag: IconBag,
  pill: IconPill,
  truck: IconTruck,
  clipboard: IconClipboard,
  building: IconBuilding,
  adjust: IconAdjust,
  count: IconCount,
  swap: IconSwap,
  users: IconUsers,
  rx: IconRx,
  clock: IconClock,
  calendar: IconCalendar,
  wallet: IconWallet,
  chart: IconChart,
  card: IconCard,
  cog: IconCog,
} as const;

export interface NavEntry {
  href: string;
  label: string;
  group: string;
  icon: keyof typeof NAV_ICONS;
}
