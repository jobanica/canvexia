import { NavLinks, type NavLink } from "./NavLinks";
import { NavDrawer } from "./NavDrawer";
import { Icon } from "./icons";
import type { SignedInStaff } from "@/server/auth";

const NAV: (NavLink & { adminOnly: boolean })[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", adminOnly: true },
  { href: "/admin/queue", label: "Verification", icon: "check", adminOnly: false },
  { href: "/admin/customers", label: "Customers", icon: "store", adminOnly: true },
  { href: "/admin/agents", label: "Agents", icon: "users", adminOnly: true },
  { href: "/admin/payout-changes", label: "Payout changes", icon: "swap", adminOnly: true },
  { href: "/admin/payouts", label: "Payouts", icon: "wallet", adminOnly: true },
  { href: "/admin/products", label: "Products & rules", icon: "box", adminOnly: true },
  { href: "/admin/agreement", label: "Agent agreement", icon: "pen", adminOnly: true },
  { href: "/admin/templates", label: "Contract templates", icon: "doc", adminOnly: true },
  { href: "/admin/settings", label: "Settings", icon: "cog", adminOnly: true },
  { href: "/admin/events", label: "Events", icon: "bolt", adminOnly: true },
  { href: "/admin/audit", label: "Audit log", icon: "list", adminOnly: true },
];

/**
 * Staff chrome: a purple sidebar, a header card, and the page on a card
 * below it. On a phone the sidebar becomes a drawer behind the hamburger —
 * twelve links do not fit across a phone. A verifier is shown only what a
 * verifier may use; the pages check again, and the database checks a third time.
 */
export function AdminShell({ staff, children }: { staff: SignedInStaff; children: React.ReactNode }) {
  const links = NAV.filter((n) => !n.adminOnly || staff.role === "admin").map(({ href, label, icon }) => ({ href, label, icon }));

  // The same contents on both sides of the breakpoint: the sidebar from `lg`
  // up, the drawer below it.
  const sidebar = (
    <>
      <div className="flex items-center gap-2 px-5 pb-6 pt-5 lg:px-7 lg:pb-8 lg:pt-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 text-sm font-bold">C</span>
        <span className="text-sm font-semibold tracking-wide">CANVEXIA Agents</span>
      </div>
      <NavLinks links={links} />
      <form action="/logout" method="post" className="mt-auto px-4 pb-4 lg:pb-0">
        <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">
          <Icon name="logout" className="h-[18px] w-[18px]" />
          Logout
        </button>
      </form>
    </>
  );

  return (
    <div className="admin-shell min-h-screen bg-[#e9e8f4] p-0 pt-[env(safe-area-inset-top)] lg:p-4">
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 lg:min-h-[calc(100vh-2rem)] lg:flex-row">
        <aside className="hidden bg-[#6c5dbe] text-white lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:rounded-2xl lg:py-6">
          {sidebar}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4 px-3 pb-6 pt-3 lg:px-0 lg:pb-0 lg:pt-0">
          <header className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm lg:gap-4 lg:px-5 lg:py-4">
            <NavDrawer
              desktopHidden
              panelClassName="bg-[#6c5dbe] text-white"
              buttonClassName="h-10 w-10 text-[#5a4bb0] hover:bg-[#f1f0f9]"
            >
              {sidebar}
            </NavDrawer>
            <div className="min-w-0">
              <p className="text-xs text-[#8b80cf]">{staff.role === "admin" ? "Admin" : "Verifier"}</p>
              <p className="truncate text-lg font-semibold text-[#5a4bb0]">Agent portal</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden max-w-[16rem] truncate rounded-lg bg-[#f1f0f9] px-3 py-2 text-xs text-slate-500 sm:block">{staff.email}</span>
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#6c5dbe] text-sm font-semibold uppercase text-white"
                title={staff.email}
              >
                {staff.email.slice(0, 1)}
              </span>
            </div>
          </header>
          <main className="flex-1 rounded-2xl bg-white p-5 shadow-sm">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-red-100 text-red-800",
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export const AGENT_TONE = { pending: "amber", active: "green", suspended: "red", removed: "slate" } as const;

export const thClass = "px-4 py-3 text-left text-xs font-semibold text-white";
export const tdClass = "px-4 py-3 align-top";
