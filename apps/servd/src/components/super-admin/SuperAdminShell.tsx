"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { signOut } from "@/app/(platform)/login/actions";
import { homeForAdmin, visibleNav, type AdminRole } from "@/lib/platform/admin-scope";

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const I = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  card: "M2 5h20v14H2zM2 10h20",
  layers: "M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5",
  receipt: "M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1z M9 8h6M9 12h6",
  userPlus: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M19 8v6M22 11h-6",
  chat: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z M12 10a2 2 0 100-4 2 2 0 000 4z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2 M5 5h14l3 7v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z",
  store: "M3 9l1.5-5h15L21 9M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M3 9h18M9 20v-6h6v6",
  film: "M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4",
  video: "M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M4 6h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z",
  grad: "M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5",
  chart: "M3 3v18h18M7 15l3-4 3 3 4-6",
  back: "M19 12H5M12 19l-7-7 7-7",
  bell: "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
};

const NAV = [
  { label: "Overview", href: "/super-admin", d: I.home },
  // Second, deliberately: it's the screen that answers "what do I do today".
  { label: "Business", href: "/super-admin/bizops", d: I.chart },
  { label: "Follow-ups", href: "/super-admin/bizops/follow-ups", d: I.inbox },
  { label: "Usage & segments", href: "/super-admin/bizops/usage", d: I.layers },
  { label: "Upsells", href: "/super-admin/bizops/upsells", d: I.card },
  { label: "Analytics", href: "/super-admin/bizops/analytics", d: I.chart },
  { label: "Subscriptions", href: "/super-admin/subscriptions", d: I.card },
  { label: "Create account", href: "/super-admin/accounts", d: I.userPlus },
  { label: "Demo storefronts", href: "/super-admin/storefronts", d: I.store },
  { label: "DIY funnel", href: "/super-admin/funnel", d: I.chart },
  { label: "Prospecting", href: "/super-admin/prospecting", d: I.pin },
  { label: "Client CRM", href: "/super-admin/crm", d: I.inbox },
  { label: "Outreach videos", href: "/super-admin/outreach", d: I.video },
  { label: "Email marketing", href: "/super-admin/email", d: I.inbox },
  { label: "Content Engine", href: "/super-admin/content-engine", d: I.film },
  { label: "Tutorials", href: "/super-admin/tutorials", d: I.grad },
  { label: "Plans", href: "/super-admin/plans", d: I.layers },
  { label: "Feature pricing", href: "/super-admin/feature-pricing", d: I.card },
  { label: "Invoices", href: "/super-admin/invoices", d: I.receipt },
  { label: "Payments", href: "/super-admin/payments", d: I.card },
  { label: "Partners", href: "/super-admin/partners", d: I.card },
  { label: "Announcements", href: "/super-admin/announcements", d: I.bell },
  { label: "Feedback", href: "/super-admin/feedback", d: I.chat },
];

export function SuperAdminShell({
  children,
  role = "owner",
}: {
  children: React.ReactNode;
  /** Scope of the signed-in admin. Defaults to full access. */
  role?: AdminRole;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Hiding a link is not access control — the layout enforces the same rules on
  // the way in. This just stops the sidebar offering doors that won't open.
  const items = visibleNav(role, NAV);
  // The wordmark goes somewhere this admin can open, not to a page that bounces.
  const home = homeForAdmin(role);
  const isActive = (href: string) =>
    href === "/super-admin" ? pathname === "/super-admin" : pathname.startsWith(href);

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-plum-ink/35">
        Platform
      </p>
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-gradient text-white shadow-sm"
                : "text-plum-ink/70 hover:bg-plum-ink/5 hover:text-plum-ink"
            }`}
          >
            <Icon d={item.d} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href={home} className="flex items-center gap-2 px-5 py-4">
        <AppIcon size={28} />
        <Wordmark size="1.15rem" />
      </Link>
      {nav}
      <div className="space-y-1 border-t border-plum-ink/10 p-3">
        <form action={signOut}>
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-plum-ink/60 hover:bg-plum-ink/5">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-cream">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-plum-ink/10 bg-white md:flex">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-plum-ink/10 bg-white/80 px-4 py-3 backdrop-blur">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-1.5 text-plum-ink/70 hover:bg-plum-ink/5 md:hidden"
            aria-label="Open menu"
          >
            <Icon d="M4 6h16M4 12h16M4 18h16" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold text-plum-ink">Servd · platform admin</p>
            <p className="truncate text-xs text-plum-ink/45">Manage every restaurant&apos;s subscription</p>
          </div>
          <span className="ml-auto rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-semibold text-brand-primary">
            super-admin
          </span>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
