import Link from "next/link";
import { can, type Capability } from "@servd/core";
import type { CurrentPartner } from "@/server/partners/auth";
import { signOutPartner } from "@/server/partners/login-action";
import { CanvexiaLockup } from "./CanvexiaBrand";

/**
 * The portal's chrome.
 *
 * Links are HIDDEN, not disabled, when the seat lacks the capability — the brief
 * asked for that and it is right: a greyed-out "Revenue" tab tells a
 * salesperson exactly what they are missing and invites a URL guess. The RLS
 * policy and `requirePartnerPageWith()` are what make the guess fail; this is
 * only the courtesy.
 *
 * Phases A3–A6 add their own entries here. A link is listed only once its route
 * exists — a nav that 404s is worse than a nav that is short.
 */
const LINKS: { href: string; label: string; need?: Capability }[] = [
  { href: "/partner", label: "Overview" },
  { href: "/partner/merchants", label: "Merchants", need: "merchants.read" },
];

export function PortalNav({ partner }: { partner: CurrentPartner }) {
  const visible = LINKS.filter((l) => !l.need || can(partner.user.role, l.need));

  return (
    <header className="border-b border-brand-ink/10 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link href="/partner" aria-label="Partner portal home">
          <CanvexiaLockup size={24} />
        </Link>

        <nav aria-label="Portal" className="order-3 flex w-full gap-5 sm:order-none sm:w-auto">
          {visible.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-brand-ink/60 hover:text-brand-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-brand-ink/50 sm:inline">
            {partner.name} · {partner.user.role}
          </span>
          <form action={signOutPartner}>
            <button className="rounded-full border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold text-brand-ink/70 hover:bg-brand-surface">
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
