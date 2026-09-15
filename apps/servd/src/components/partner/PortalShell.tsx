import Link from "next/link";
import { can, type Capability } from "@servd/core";
import type { CurrentPartner } from "@/server/partners/auth";
import { signOutPartner } from "@/server/partners/login-action";
import { Mark } from "@servd/ui";
import {
  IconBell,
  IconFunnel,
  IconGear,
  IconGlobe,
  IconGrid,
  IconPalette,
  IconSearch,
  IconStore,
  IconUsers,
  IconWallet,
} from "./PortalIcons";

/**
 * The portal's chrome: a fixed sidebar and a top bar.
 *
 * Replaces the horizontal nav. Seven sections do not fit across the top of a
 * laptop without shrinking to the point where nobody reads them, and the
 * sidebar is what the dashboard layout this follows is built around.
 *
 * Links are HIDDEN, not disabled, when the seat lacks the capability. A
 * greyed-out "Revenue" tells a salesperson exactly what they are missing and
 * invites a URL guess; `requirePartnerPageWith()` and the RLS policy are what
 * make the guess fail. Counts render only when a page has one to show — a badge
 * reading 0 is a badge that teaches people to ignore badges.
 *
 * MOBILE. The sidebar collapses to a bottom bar rather than a hamburger: a
 * partner uses this standing in a restaurant, one-handed, and a drawer costs a
 * tap before every navigation. The labels go, the icons stay.
 */
export interface NavCounts {
  pipeline?: number;
  merchants?: number;
}

type Item = {
  href: string;
  label: string;
  icon: React.ReactNode;
  need?: Capability;
  count?: number;
};

export function PortalShell({
  partner,
  title,
  subtitle,
  actions,
  counts,
  children,
}: {
  partner: CurrentPartner;
  title: string;
  subtitle?: string;
  /** Filter chips or buttons for the title row. */
  actions?: React.ReactNode;
  counts?: NavCounts;
  children: React.ReactNode;
}) {
  const items: Item[] = [
    { href: "/partner", label: "Overview", icon: <IconGrid /> },
    {
      href: "/partner/pipeline",
      label: "Pipeline",
      icon: <IconFunnel />,
      need: "pipeline.read",
      count: counts?.pipeline,
    },
    {
      href: "/partner/merchants",
      label: "Merchants",
      icon: <IconStore />,
      need: "merchants.read",
      count: counts?.merchants,
    },
    { href: "/partner/revenue", label: "Revenue", icon: <IconWallet />, need: "revenue.read" },
    { href: "/partner/brand", label: "Brand", icon: <IconPalette />, need: "brand.write" },
    { href: "/partner/domains", label: "Domains", icon: <IconGlobe />, need: "domains.write" },
  ];

  const lower: Item[] = [
    { href: "/partner/team", label: "Team", icon: <IconUsers />, need: "team.read" },
    { href: "/partner/settings", label: "Settings", icon: <IconGear />, need: "settings.write" },
  ];

  const allowed = (i: Item) => !i.need || can(partner.user.role, i.need);
  const main = items.filter(allowed);
  const secondary = lower.filter(allowed);

  // The initials the avatar falls back to. No photo is stored anywhere in this
  // system, so the circle is always initials rather than a broken image.
  const initials = (partner.user.name ?? partner.user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const row = (i: Item, active = false) => (
    <Link
      key={i.href}
      href={i.href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-brand-primary/10 font-semibold text-brand-primary"
          : "text-brand-ink/60 hover:bg-brand-ink/[0.04] hover:text-brand-ink"
      }`}
    >
      <span className="shrink-0">{i.icon}</span>
      <span className="truncate">{i.label}</span>
      {typeof i.count === "number" && i.count > 0 && (
        <span className="ml-auto rounded-full bg-brand-primary px-2 py-0.5 text-[0.65rem] font-bold text-white">
          {i.count}
        </span>
      )}
    </Link>
  );

  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-brand-ink/10 bg-white px-4 py-5 lg:flex">
          <Link href="/partner" className="flex items-center gap-2.5 px-2" aria-label="Portal home">
            <Mark size={26} title="CANVEXIA" />
            <span className="font-bold tracking-[0.12em] text-brand-ink">CANVEXIA</span>
          </Link>

          <nav aria-label="Portal" className="mt-8 flex flex-col gap-1">
            {main.map((i) => row(i))}
          </nav>

          {secondary.length > 0 && (
            <nav aria-label="Account" className="mt-auto flex flex-col gap-1 border-t border-brand-ink/10 pt-4">
              {secondary.map((i) => row(i))}
            </nav>
          )}
        </aside>

        {/* Main column */}
        <div className="min-w-0 flex-1 pb-20 lg:pb-0">
          <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-brand-ink/10 bg-white px-5 py-3.5">
            <Link href="/partner" className="lg:hidden" aria-label="Portal home">
              <Mark size={24} title="CANVEXIA" />
            </Link>

            {/*
              The search box is PRESENT and DISABLED, with a label that says why.
              The layout this follows has one, and leaving a live-looking input
              that searches nothing would be worse than an honest placeholder —
              a partner types into it, nothing happens, and they stop trusting
              the screen.
            */}
            <div className="relative hidden min-w-0 flex-1 sm:block">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-ink/30">
                <IconSearch size={18} />
              </span>
              <input
                disabled
                aria-label="Search (not available yet)"
                placeholder="Search — coming with the next release"
                className="min-h-[42px] w-full cursor-not-allowed rounded-full border border-brand-ink/10 bg-brand-surface pl-11 pr-4 text-sm text-brand-ink/40 placeholder:text-brand-ink/30"
              />
            </div>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-brand-ink/25 sm:block" title="No notifications yet">
                <IconBell size={20} />
              </span>
              <span className="hidden text-right text-xs leading-tight sm:block">
                <span className="block font-semibold">{partner.name}</span>
                <span className="block text-brand-ink/45">{partner.user.role}</span>
              </span>
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/12 text-xs font-bold text-brand-primary"
              >
                {initials}
              </span>
              <form action={signOutPartner}>
                <button className="rounded-full border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold text-brand-ink/70 hover:bg-brand-surface">
                  Log out
                </button>
              </form>
            </div>
          </header>

          <main className="px-5 py-7 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-heading text-[1.6rem] font-bold leading-tight">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-brand-ink/55">{subtitle}</p>}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>

            <div className="mt-6">{children}</div>
          </main>
        </div>
      </div>

      {/* Phone: a bottom bar, not a drawer. One tap, not two. */}
      <nav
        aria-label="Portal"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-brand-ink/10 bg-white lg:hidden"
      >
        {[...main, ...secondary].slice(0, 5).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.6rem] font-semibold text-brand-ink/55"
          >
            <span className="relative">
              {i.icon}
              {typeof i.count === "number" && i.count > 0 && (
                <span className="absolute -right-2 -top-1.5 rounded-full bg-brand-primary px-1.5 text-[0.55rem] font-bold text-white">
                  {i.count}
                </span>
              )}
            </span>
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** The filter chip in the title row of the reference layout. */
export function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-[38px] items-center gap-2 rounded-full border border-brand-ink/12 bg-white px-4 text-xs font-semibold text-brand-ink/65">
      {children}
    </span>
  );
}
