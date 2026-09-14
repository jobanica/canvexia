import Link from "next/link";
import { ROLE_LABEL, can, type Permission } from "@/lib/pharmacy/roles";
import type { CurrentStaff } from "@/server/tenancy/current-user";
import { PharmacySwitcher } from "./PharmacySwitcher";

/**
 * The signed-in chrome: who you are, which pharmacy, and where you can go.
 *
 * The nav is filtered by permission rather than rendered and then disabled. A
 * greyed-out link still tells a cashier the reports page exists and is worth
 * poking at; more to the point, hiding it here and checking it again on the
 * page is two layers, and the page's check is the one that matters.
 */
const NAV: { href: string; label: string; needs?: Permission }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/pos", label: "Counter", needs: "sell" },
  { href: "/receipts", label: "Receipts", needs: "sell" },
  { href: "/receiving", label: "Receive", needs: "manageStock" },
  { href: "/staff", label: "Staff", needs: "manageStaff" },
  { href: "/settings", label: "Settings", needs: "manageSettings" },
];

export function AppShell({
  staff,
  children,
}: {
  staff: CurrentStaff;
  children: React.ReactNode;
}) {
  const links = NAV.filter((n) => !n.needs || can(staff.role, n.needs));

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <span className="font-semibold tracking-tight">Reseta</span>

          {staff.memberships.length > 1 ? (
            <PharmacySwitcher
              memberships={staff.memberships}
              current={staff.pharmacyId}
            />
          ) : (
            <span className="text-sm text-slate-600">{staff.pharmacyName}</span>
          )}

          <nav className="flex items-center gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-slate-600 hover:text-slate-900">
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {staff.displayName ?? staff.email}
              <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {ROLE_LABEL[staff.role]}
              </span>
            </span>
            {/* POST, not a link — see the route for why. */}
            <form action="/logout" method="post">
              <button type="submit" className="text-slate-500 hover:text-slate-900 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {staff.pharmacyStatus !== "active" && (
        <p className="border-b border-amber-300 bg-amber-50 px-6 py-3 text-center text-sm text-amber-900">
          {staff.pharmacyName} is <strong>{staff.pharmacyStatus}</strong> and cannot
          dispense yet. A pharmacy is created pending on purpose — it cannot
          legally dispense before its FDA Licence to Operate is on file.
        </p>
      )}

      {children}
    </div>
  );
}
