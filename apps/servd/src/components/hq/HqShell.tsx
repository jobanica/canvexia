import Link from "next/link";
import { hqCan, type HqCapability } from "@servd/core";
import { Mark } from "@servd/ui";
import type { CurrentHqUser } from "@/server/hq/auth";
import { Avatar } from "@/components/canvexia/Cards";
import {
  IconFunnel,
  IconGear,
  IconGrid,
  IconGlobe,
  IconStore,
  IconUsers,
  IconWallet,
} from "@/components/partner/PortalIcons";

/**
 * The HQ console's chrome.
 *
 * ALWAYS CANVEXIA, never a partner's brand. `/hq` reads across every partner at
 * once, so wearing one operator's colours would be actively misleading about
 * whose data is on screen — the `brand-canvexia` class here pins the variables
 * rather than inheriting whatever the last partner-scoped page set.
 *
 * Links are HIDDEN, not disabled, when the seat lacks the capability — same
 * rule as the partner portal, and for the same reason: a greyed-out "Billing"
 * tells an ops admin exactly what they are missing and invites a URL guess.
 * `requireHqPage()` and `requireHqAction()` are what make the guess fail.
 *
 * It deliberately does NOT reuse PortalShell. That component takes a
 * `CurrentPartner`, renders a partner's own nav, and carries the impersonation
 * banner — three things that are wrong here. What the two share is the visual
 * vocabulary, which lives in components/canvexia.
 */
type Item = { href: string; label: string; icon: React.ReactNode; need?: HqCapability };

export function HqShell({
  user,
  title,
  subtitle,
  actions,
  children,
}: {
  user: CurrentHqUser;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const items: Item[] = [
    { href: "/hq", label: "Overview", icon: <IconGrid /> },
    { href: "/hq/partners", label: "Partners", icon: <IconUsers />, need: "partners.read" },
    { href: "/hq/territories", label: "Territories", icon: <IconGlobe />, need: "territories.write" },
    { href: "/hq/applications", label: "Applications", icon: <IconFunnel />, need: "applications.write" },
    { href: "/hq/merchants", label: "Merchants", icon: <IconStore />, need: "partners.read" },
    { href: "/hq/billing", label: "Billing", icon: <IconWallet />, need: "billing.run" },
  ];

  const lower: Item[] = [
    { href: "/hq/team", label: "HQ team", icon: <IconUsers />, need: "hq.team" },
    { href: "/hq/audit", label: "Audit", icon: <IconGear />, need: "audit.read" },
  ];

  const allowed = (i: Item) => !i.need || hqCan(user.role, i.need);
  const main = items.filter(allowed);
  const secondary = lower.filter(allowed);

  const row = (i: Item) => (
    <Link
      key={i.href}
      href={i.href}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-brand-ink/60 transition-colors hover:bg-brand-ink/[0.04] hover:text-brand-ink"
    >
      <span className="shrink-0">{i.icon}</span>
      <span className="truncate">{i.label}</span>
    </Link>
  );

  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-brand-ink/10 bg-white px-4 py-5 lg:flex">
          <Link href="/hq" className="flex items-center gap-2.5 px-2" aria-label="HQ home">
            <Mark size={26} title="CANVEXIA" />
            <span className="min-w-0">
              <span className="block font-bold leading-none tracking-[0.12em] text-brand-ink">
                CANVEXIA
              </span>
              <span className="mt-0.5 block text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-brand-primary">
                HQ
              </span>
            </span>
          </Link>

          <nav aria-label="HQ" className="mt-8 flex flex-col gap-1">
            {main.map(row)}
          </nav>

          {secondary.length > 0 && (
            <nav
              aria-label="Administration"
              className="mt-auto flex flex-col gap-1 border-t border-brand-ink/10 pt-4"
            >
              {secondary.map(row)}
              {/*
                Back to Servd's own back office. The two consoles are separate
                on purpose — /hq is CANVEXIA across every product, /super-admin
                is one product's ops — and a person who works in both should not
                have to remember a URL.
              */}
              <Link
                href="/super-admin"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-brand-ink/40 hover:text-brand-ink/70"
              >
                <span className="shrink-0">
                  <IconStore />
                </span>
                <span className="truncate">Servd back office</span>
              </Link>
            </nav>
          )}
        </aside>

        <div className="min-w-0 flex-1 pb-20 lg:pb-0">
          <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-brand-ink/10 bg-white px-5 py-3.5">
            <Link href="/hq" className="lg:hidden" aria-label="HQ home">
              <Mark size={24} title="CANVEXIA" />
            </Link>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-right text-xs leading-tight sm:block">
                <span className="block font-semibold">{user.displayName ?? user.email}</span>
                <span className="block text-brand-ink/45">
                  {user.role === "super_admin" ? "Super admin" : "Ops"}
                </span>
              </span>
              <Avatar name={user.displayName ?? user.email} />
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

      {/* Phone: a bottom bar, same as the portal. The Overview and the
          attention list are the two things that have to work standing up. */}
      <nav
        aria-label="HQ"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-brand-ink/10 bg-white lg:hidden"
      >
        {[...main, ...secondary].slice(0, 5).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.6rem] font-semibold text-brand-ink/55"
          >
            {i.icon}
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
