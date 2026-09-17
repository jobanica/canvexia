import Link from "next/link";
import { ROLE_LABEL, can, type Permission } from "@/lib/pharmacy/roles";
import type { CurrentStaff } from "@/server/tenancy/current-user";
import { PharmacySwitcher } from "./PharmacySwitcher";
import { OfflineNotice } from "./OfflineNotice";
import { MobileNav } from "./MobileNav";
import { SidebarNav } from "./SidebarNav";
import type { NavEntry } from "./nav-items";
import { BranchSwitcher } from "./BranchSwitcher";
import { branchContext } from "@/server/pharmacy/branches";

/**
 * The signed-in chrome: who you are, which pharmacy, which branch, and where
 * you can go.
 *
 * A PINNED SIDEBAR ON DESKTOP, A DRAWER ON A PHONE. The counter PC has the room
 * and the nav is used constantly — hiding fifteen destinations behind a button
 * on a 24" screen costs a click every time. The phone does not have the room,
 * so the same list becomes a drawer.
 *
 * The nav is filtered by permission rather than rendered and then disabled. A
 * greyed-out link still tells a cashier the reports page exists and is worth
 * poking at; more to the point, hiding it here and checking it again on the
 * page is two layers, and the page's check is the one that matters.
 */
const NAV: (NavEntry & { needs?: Permission })[] = [
  { href: "/", label: "Dashboard", group: "Today", icon: "dashboard" },
  { href: "/alerts", label: "Alerts", group: "Today", icon: "bell" },
  { href: "/pos", label: "Counter", group: "Today", icon: "cart", needs: "sell" },
  { href: "/receipts", label: "Receipts", group: "Today", icon: "receipt", needs: "sell" },
  { href: "/shift", label: "Till", group: "Today", icon: "till", needs: "sell" },
  { href: "/orders", label: "Online orders", group: "Today", icon: "bag", needs: "sell" },

  { href: "/catalogue", label: "Catalogue", group: "Stock", icon: "pill", needs: "manageCatalogue" },
  { href: "/receiving", label: "Receive", group: "Stock", icon: "truck", needs: "manageStock" },
  { href: "/purchase-orders", label: "Purchase orders", group: "Stock", icon: "clipboard", needs: "manageStock" },
  { href: "/suppliers", label: "Suppliers", group: "Stock", icon: "building", needs: "manageStock" },
  { href: "/inventory", label: "Adjustments", group: "Stock", icon: "adjust", needs: "manageStock" },
  { href: "/stocktake", label: "Stocktake", group: "Stock", icon: "count", needs: "manageStock" },
  { href: "/transfers", label: "Transfers", group: "Stock", icon: "swap", needs: "manageStock" },

  { href: "/customers", label: "Customers", group: "People", icon: "users", needs: "sell" },
  { href: "/prescriptions", label: "Prescriptions", group: "People", icon: "rx", needs: "sell" },
  { href: "/staff", label: "Staff logins", group: "People", icon: "users", needs: "manageStaff" },
  { href: "/hr/clock", label: "Clock in", group: "People", icon: "clock" },
  { href: "/hr/employees", label: "Employees", group: "People", icon: "users", needs: "manageStaff" },
  { href: "/hr/timesheets", label: "Timesheets", group: "People", icon: "calendar", needs: "manageStaff" },
  { href: "/hr/payroll", label: "Payroll", group: "People", icon: "wallet", needs: "manageStaff" },
  { href: "/hr/leave", label: "Leave", group: "People", icon: "calendar" },

  { href: "/readings", label: "Z-readings", group: "Business", icon: "chart", needs: "viewReports" },
  { href: "/billing", label: "Billing", group: "Business", icon: "card", needs: "manageSettings" },
  { href: "/branches", label: "Branches", group: "Business", icon: "building", needs: "manageSettings" },
  { href: "/settings", label: "Settings", group: "Business", icon: "cog", needs: "manageSettings" },
];

/**
 * ASYNC, because the branch selection is read from a cookie on the server.
 * Every page already awaits its own data; this joins that list rather than
 * shipping a client component that fetches the branch list on mount.
 */
export async function AppShell({
  staff,
  children,
}: {
  staff: CurrentStaff;
  children: React.ReactNode;
}) {
  const links: NavEntry[] = NAV.filter((n) => !n.needs || can(staff.role, n.needs)).map(
    ({ href, label, group, icon }) => ({ href, label, group, icon }),
  );
  const branch = await branchContext(staff.pharmacyId);
  const who = staff.displayName ?? staff.email;

  return (
    <div className="app-shell min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      {/*
        ABOVE EVERYTHING, on every screen. Installing the app is what created
        the need for it: in a standalone window there is no address bar, no
        reload spinner and no dinosaur, so a dropped connection looks exactly
        like a working one until a Complete button hangs.
      */}
      <OfflineNotice />

      <aside
        data-print-hide
        className="hidden border-r border-white/10 bg-white/[0.04] backdrop-blur-xl lg:flex lg:h-screen lg:flex-col lg:overflow-hidden"
      >
        <Link href="/" className="flex shrink-0 items-center gap-3 px-5 py-5">
          <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white shadow-lg shadow-violet-900/40">
            R
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">Resceta</span>
        </Link>
        <p className="shrink-0 truncate px-5 pb-3 text-xs uppercase tracking-wider text-slate-500">
          {staff.pharmacyName}
        </p>

        {/* Only the nav scrolls; the footer stays pinned where a thumb expects it. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav links={links} />
        </div>

        <div className="shrink-0 border-t border-white/10 px-5 py-4">
          <p className="truncate text-sm font-medium text-white">{who}</p>
          <p className="text-xs text-slate-500">{ROLE_LABEL[staff.role]}</p>
          {/* POST, not a link — see the route for why. */}
          <form action="/logout" method="post" className="mt-2">
            <button type="submit" className="text-xs text-slate-500 hover:text-white hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header
          data-print-hide
          className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 bg-[#171327]/80 px-4 py-3 backdrop-blur-xl lg:px-6"
        >
          <MobileNav links={links} pharmacyName={staff.pharmacyName} who={who} role={ROLE_LABEL[staff.role]} />

          <Link href="/" className="text-base font-semibold tracking-tight text-white lg:hidden">
            Resceta
          </Link>

          <BranchSwitcher
            branches={branch.branches}
            currentId={branch.current?.id ?? null}
            all={branch.all}
            // Spanning branches is a reporting position, so it is offered to
            // the people who read reports.
            canSeeAll={can(staff.role, "viewReports")}
          />

          {staff.memberships.length > 1 && (
            <PharmacySwitcher memberships={staff.memberships} current={staff.pharmacyId} />
          )}

          <div className="ml-auto hidden items-center gap-3 text-sm lg:flex">
            <span className="text-slate-500">{staff.pharmacyName}</span>
          </div>
        </header>

        {staff.pharmacyStatus !== "active" && (
          <p
            data-print-hide
            className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-3 text-center text-sm text-amber-200"
          >
            {staff.pharmacyName} is <strong>{staff.pharmacyStatus}</strong> and cannot
            dispense yet. A pharmacy is created pending on purpose — it cannot
            legally dispense before its FDA Licence to Operate is on file.
          </p>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
