import Link from "next/link";
import { ROLE_LABEL, can, type Permission } from "@/lib/pharmacy/roles";
import type { CurrentStaff } from "@/server/tenancy/current-user";
import { PharmacySwitcher } from "./PharmacySwitcher";
import { OfflineNotice } from "./OfflineNotice";
import { NavDrawer, type NavLink } from "./NavDrawer";

/**
 * The signed-in chrome: who you are, which pharmacy, and where you can go.
 *
 * The nav is filtered by permission rather than rendered and then disabled. A
 * greyed-out link still tells a cashier the reports page exists and is worth
 * poking at; more to the point, hiding it here and checking it again on the
 * page is two layers, and the page's check is the one that matters.
 *
 * GROUPED, AND IN A DRAWER. Fourteen links in a row wrap onto three lines on a
 * counter screen and scroll off the right on a phone — and the ones that fall
 * off are the newest, which are the ones nobody has found yet. The four groups
 * are the four jobs: serving a customer, keeping the shelf right, the people,
 * and the business.
 */
const NAV: (NavLink & { needs?: Permission })[] = [
  { href: "/", label: "Dashboard", group: "Today" },
  { href: "/alerts", label: "Alerts", group: "Today" },
  { href: "/pos", label: "Counter", group: "Today", needs: "sell" },
  { href: "/receipts", label: "Receipts", group: "Today", needs: "sell" },
  { href: "/shift", label: "Till", group: "Today", needs: "sell" },
  { href: "/readings", label: "Z-readings", group: "Business", needs: "viewReports" },

  { href: "/catalogue", label: "Catalogue", group: "Stock", needs: "manageCatalogue" },
  { href: "/receiving", label: "Receive", group: "Stock", needs: "manageStock" },
  { href: "/purchase-orders", label: "Purchase orders", group: "Stock", needs: "manageStock" },
  { href: "/suppliers", label: "Suppliers", group: "Stock", needs: "manageStock" },
  { href: "/inventory", label: "Adjustments", group: "Stock", needs: "manageStock" },
  { href: "/stocktake", label: "Stocktake", group: "Stock", needs: "manageStock" },

  { href: "/customers", label: "Customers", group: "People", needs: "sell" },
  { href: "/prescriptions", label: "Prescriptions", group: "People", needs: "sell" },
  { href: "/staff", label: "Staff logins", group: "People", needs: "manageStaff" },
  { href: "/hr/clock", label: "Clock in", group: "People" },
  { href: "/hr/employees", label: "Employees", group: "People", needs: "manageStaff" },
  { href: "/hr/timesheets", label: "Timesheets", group: "People", needs: "manageStaff" },
  { href: "/hr/payroll", label: "Payroll", group: "People", needs: "manageStaff" },
  { href: "/hr/leave", label: "Leave", group: "People" },

  { href: "/billing", label: "Billing", group: "Business", needs: "manageSettings" },
  { href: "/settings", label: "Settings", group: "Business", needs: "manageSettings" },
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
      {/*
        ABOVE EVERYTHING, on every screen. Installing the app is what created
        the need for it: in a standalone window there is no address bar, no
        reload spinner and no dinosaur, so a dropped connection looks exactly
        like a working one until a Complete button hangs.
      */}
      <OfflineNotice />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3">
          <NavDrawer
            links={links.map(({ href, label, group }) => ({ href, label, group }))}
            footer={
              <div className="text-sm">
                <p className="font-medium">{staff.displayName ?? staff.email}</p>
                <p className="text-xs text-slate-500">{ROLE_LABEL[staff.role]}</p>
              </div>
            }
          />

          <Link href="/" className="font-semibold tracking-tight">
            Resceta
          </Link>

          {staff.memberships.length > 1 ? (
            <PharmacySwitcher
              memberships={staff.memberships}
              current={staff.pharmacyId}
            />
          ) : (
            <span className="text-sm text-slate-600">{staff.pharmacyName}</span>
          )}

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">
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
