import Link from "next/link";
import { type PartnerPermission } from "@servd/core";
import type { CurrentPartner } from "@/server/partners/auth";
import {
  IconChat,
  IconClock,
  IconFunnel,
  IconGear,
  IconGlobe,
  IconGrid,
  IconMapPin,
  IconPalette,
  IconStore,
  IconUsers,
  IconWallet,
} from "./PortalIcons";

/**
 * THE PORTAL'S NAV, in one place.
 *
 * It lived inside PortalShell, which meant the field app — the screen a
 * salesperson actually keeps open all day, deliberately built outside the
 * shell — could not show it. Its only way back was a single "← Portal" link,
 * so every one of these destinations cost a trip through the Overview.
 *
 * Extracted rather than duplicated: a nav that has to be edited in two files
 * is a nav that will disagree with itself the first time somebody adds a
 * permission.
 */
export interface NavCounts {
  pipeline?: number;
  merchants?: number;
  /** Merchant messages nobody has answered. */
  messages?: number;
}

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /**
   * The A7 PERMISSION this link needs.
   *
   * Was a `Capability` from the fixed matrix. It is a permission now because a
   * partner admin can change the answer at /team/permissions, and a nav
   * derived from a matrix nobody can edit would show links the server then
   * refuses — which is worse than hiding them, because it teaches people the
   * portal is broken rather than that they lack the permission.
   */
  need?: PartnerPermission;
  count?: number;
};

/**
 * Links are HIDDEN, not disabled, when the seat lacks the permission. A
 * greyed-out "Revenue" tells a salesperson exactly what they are missing and
 * invites a URL guess; `requirePartnerPageWith()` and the RLS policy are what
 * make the guess fail. Counts render only when a page has one to show — a badge
 * reading 0 is a badge that teaches people to ignore badges.
 */
export function partnerNav(
  partner: CurrentPartner,
  counts?: NavCounts,
): { main: NavItem[]; secondary: NavItem[] } {
  const items: NavItem[] = [
    { href: "/partner", label: "Overview", icon: <IconGrid /> },
    // Renewals sits high because somebody is waiting on it: a merchant who has
    // paid and not been confirmed is one bad day from being suspended for it.
    { href: "/partner/renewals", label: "Renewals", icon: <IconWallet />, need: "merchants.change_plan" },
    // What they owe HQ, kept apart from Revenue on purpose: one is what they
    // earned and the other is the bill, and a payable inside an earnings screen
    // is a deadline nobody notices.
    { href: "/partner/payables", label: "Payables", icon: <IconWallet />, need: "revenue.view" },
    {
      href: "/partner/pipeline",
      label: "Pipeline",
      icon: <IconFunnel />,
      need: "pipeline.view_own",
      count: counts?.pipeline,
    },
    {
      href: "/partner/merchants",
      label: "Merchants",
      icon: <IconStore />,
      need: "merchants.view_assigned",
      count: counts?.merchants,
    },
    { href: "/partner/revenue", label: "Revenue", icon: <IconWallet />, need: "revenue.view" },
    { href: "/partner/brand", label: "Brand", icon: <IconPalette />, need: "brand.edit" },
    { href: "/partner/domains", label: "Domains", icon: <IconGlobe />, need: "domains.write" },
  ];

  // The field app and the manager's view of it. Two entries rather than one
  // screen that branches, because they are different jobs: one is "check me
  // in", the other is "where was the team". A salesperson holds only the first.
  if (partner.permissions.has("attendance.checkin")) {
    items.splice(1, 0, {
      href: "/partner/attendance",
      label: "Field",
      icon: <IconMapPin />,
    });
  }
  if (partner.permissions.has("attendance.view_all")) {
    items.push({
      href: "/partner/attendance/manager",
      label: "Attendance",
      icon: <IconClock />,
      need: "attendance.view_all",
    });
  }

  // Their merchants' own messages. Above the team block for the same reason
  // Renewals sits high: somebody is waiting on it.
  if (partner.permissions.has("support.tickets")) {
    items.push({
      href: "/partner/feedback",
      label: "Messages",
      icon: <IconChat />,
      need: "support.tickets",
      count: counts?.messages,
    });
  }

  // SMS sits above the team block: it is day-to-day work for whoever holds
  // `sms.send`, not an administrative setting. Hidden entirely without the
  // permission, like everything else here.
  if (partner.permissions.has("sms.send")) {
    items.push({ href: "/partner/sms", label: "SMS", icon: <IconChat />, need: "sms.send" });
  } else if (partner.permissions.has("sms.reply_own")) {
    // A salesperson gets the INBOX and not the composer: answering somebody who
    // texted them back is the job; broadcasting to the whole book is not.
    items.push({
      href: "/partner/sms/inbox",
      label: "SMS",
      icon: <IconChat />,
      need: "sms.reply_own",
    });
  }

  const lower: NavItem[] = [
    {
      href: "/partner/commissions",
      label: "Commissions",
      icon: <IconWallet />,
      need: "commissions.view_own",
    },
    { href: "/partner/team", label: "Team", icon: <IconUsers />, need: "team.manage" },
    { href: "/partner/settings", label: "Settings", icon: <IconGear />, need: "settings.write" },
  ];

  // The seat's RESOLVED permissions — defaults with this partner's overrides on
  // top — not the fixed matrix.
  const allowed = (i: NavItem) => !i.need || partner.permissions.has(i.need);
  return { main: items.filter(allowed), secondary: lower.filter(allowed) };
}

/** One row, shared by the desktop sidebar and the drawer so they cannot drift. */
export function NavRow({ item, active = false }: { item: NavItem; active?: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-brand-primary/10 font-semibold text-brand-primary"
          : "text-brand-ink/60 hover:bg-brand-ink/[0.04] hover:text-brand-ink"
      }`}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {typeof item.count === "number" && item.count > 0 && (
        <span className="ml-auto rounded-full bg-brand-primary px-2 py-0.5 text-[0.65rem] font-bold text-white">
          {item.count}
        </span>
      )}
    </Link>
  );
}

/**
 * The whole nav, both groups, nothing truncated — what goes inside the drawer.
 *
 * The secondary group is pushed to the bottom on desktop by `mt-auto`; in a
 * drawer that is scrollable it just follows a rule, because "as far down as
 * this panel goes" is a different distance on every phone.
 */
export function NavGroups({
  main,
  secondary,
  extra,
}: {
  main: NavItem[];
  secondary: NavItem[];
  /** Anything that belongs under the divider but is not a permissioned item. */
  extra?: React.ReactNode;
}) {
  return (
    <>
      <nav aria-label="Sections" className="flex flex-col gap-1">
        {main.map((i) => (
          <NavRow key={i.href} item={i} />
        ))}
      </nav>
      {(secondary.length > 0 || extra) && (
        <nav
          aria-label="Account"
          className="mt-4 flex flex-col gap-1 border-t border-brand-ink/10 pt-4"
        >
          {secondary.map((i) => (
            <NavRow key={i.href} item={i} />
          ))}
          {extra}
        </nav>
      )}
    </>
  );
}
