import Link from "next/link";
import type { SignedInStaff } from "@/server/auth";

const NAV: { href: string; label: string; adminOnly: boolean }[] = [
  { href: "/admin", label: "Overview", adminOnly: false },
  { href: "/admin/agents", label: "Agents", adminOnly: true },
  { href: "/admin/products", label: "Products & rules", adminOnly: true },
  { href: "/admin/agreement", label: "Agent agreement", adminOnly: true },
  { href: "/admin/settings", label: "Settings", adminOnly: true },
  { href: "/admin/events", label: "Events", adminOnly: true },
  { href: "/admin/audit", label: "Audit log", adminOnly: true },
];

/**
 * Staff chrome. A verifier is shown only what a verifier may use; the pages
 * check again, and the database checks a third time.
 */
export function AdminShell({ staff, children }: { staff: SignedInStaff; children: React.ReactNode }) {
  const links = NAV.filter((n) => !n.adminOnly || staff.role === "admin");
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <span className="font-semibold tracking-tight">CANVEXIA Agents · Admin</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-slate-600 hover:text-slate-900">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {staff.email}
              <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{staff.role}</span>
            </span>
            <form action="/logout" method="post">
              <button type="submit" className="text-slate-500 hover:text-slate-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
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

export const thClass = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
export const tdClass = "px-3 py-2 align-top";
