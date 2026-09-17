import Link from "next/link";
import type { CurrentPartner } from "@/server/partners/auth";
import { signOutPartner } from "@/server/partners/login-action";
import { InstallApp } from "@/components/pwa/InstallApp";
import { NavDrawer } from "@/components/nav/NavDrawer";
import { Mark } from "@servd/ui";
import { IconBell, IconSearch } from "./PortalIcons";
import { NavGroups, NavRow, partnerNav, type NavCounts } from "./portal-nav";

export type { NavCounts };

/**
 * The portal's chrome: a fixed sidebar and a top bar.
 *
 * Seven sections do not fit across the top of a laptop without shrinking to the
 * point where nobody reads them, and the sidebar is what the dashboard layout
 * this follows is built around.
 *
 * PHONE: A HAMBURGER, NOT A BOTTOM BAR.
 *
 * It was a bottom bar, on the argument that a partner uses this standing in a
 * restaurant and a drawer costs a tap before every navigation. That argument
 * was right about the tap and wrong about the cost, because the bar could only
 * hold five and this nav runs to fourteen. Everything past the fifth — Brand,
 * Domains, Commissions, Team, Settings — had no control on a phone at all. It
 * was not hidden by a permission; it was hidden by `.slice(0, 5)`, silently,
 * from people who held the permission.
 *
 * A tap to open a menu is a cost. A section you cannot reach from your phone is
 * not a cost, it is a missing feature. So: one tap, and then all of it.
 */
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
  const { main, secondary } = partnerNav(partner, counts);

  // The initials the avatar falls back to. No photo is stored anywhere in this
  // system, so the circle is always initials rather than a broken image.
  const initials = (partner.user.name ?? partner.user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const lockup = (
    <Link href="/partner" className="flex items-center gap-2.5" aria-label="Portal home">
      <Mark size={24} title="CANVEXIA" />
      <span className="font-bold tracking-[0.12em] text-brand-ink">CANVEXIA</span>
    </Link>
  );

  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      {/*
        HQ IS LOOKING. Above everything, on every screen, in ink rather than a
        tasteful tint — this is the difference between an operator seeing HQ in
        their audit log and an operator DISCOVERING it. The session is read-only
        and says so; server/hq/impersonate.ts is what makes that true, and the
        refusal is at the action, not here.
      */}
      {partner.impersonatedBy && (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-ink px-4 py-2 text-center text-xs font-semibold text-white">
          <span>
            CANVEXIA HQ is viewing {partner.name}&rsquo;s portal.{" "}
            <span className="font-normal text-white/70">
              Read-only · {partner.impersonatedBy.hqAdminEmail}
            </span>
          </span>
          <a
            href="/partner/view-as/end"
            className="rounded-full bg-white/15 px-3 py-0.5 font-semibold text-white hover:bg-white/25"
          >
            End session
          </a>
        </div>
      )}

      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-brand-ink/10 bg-white px-4 py-5 lg:flex">
          <Link href="/partner" className="flex items-center gap-2.5 px-2" aria-label="Portal home">
            <Mark size={26} title="CANVEXIA" />
            <span className="font-bold tracking-[0.12em] text-brand-ink">CANVEXIA</span>
          </Link>

          <nav aria-label="Portal" className="mt-8 flex flex-col gap-1">
            {main.map((i) => (
              <NavRow key={i.href} item={i} />
            ))}
          </nav>

          {secondary.length > 0 && (
            <nav
              aria-label="Account"
              className="mt-auto flex flex-col gap-1 border-t border-brand-ink/10 pt-4"
            >
              {secondary.map((i) => (
                <NavRow key={i.href} item={i} />
              ))}
            </nav>
          )}
        </aside>

        {/* Main column */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-brand-ink/10 bg-white px-4 py-3.5 sm:px-5">
            {/*
              The hamburger sits FIRST, left of the logo: it is the control
              people reach for, and on a phone the logo is decoration.
            */}
            <div className="lg:hidden">
              <NavDrawer label="Portal" header={lockup}>
                <NavGroups main={main} secondary={secondary} />
              </NavDrawer>
            </div>
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
              {/*
                Under impersonation this button would sign out the HQ ADMIN's
                Supabase session, not the partner's — which is not what it says
                and would strand them logged out of their own console. Ending
                the view-as session is the honest action to offer there.
              */}
              {partner.impersonatedBy ? (
                <a
                  href="/partner/view-as/end"
                  className="rounded-full border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold text-brand-ink/70 hover:bg-brand-surface"
                >
                  End session
                </a>
              ) : (
                <form action={signOutPartner}>
                  <button className="rounded-full border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold text-brand-ink/70 hover:bg-brand-surface">
                    Log out
                  </button>
                </form>
              )}
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

            {/*
              IN THE MAIN COLUMN, not the sidebar. The sidebar is `lg:flex` —
              hidden on a phone — and a phone is the device a partner actually
              installs this on. Below the content rather than above it so it
              never pushes the work down the screen; it renders nothing at all
              unless this browser can install the portal and has not already.
            */}
            <InstallApp
              label="CANVEXIA"
              storageKey="canvexia-install-portal"
              className="mt-8 max-w-sm"
            />
          </main>
        </div>
      </div>
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
