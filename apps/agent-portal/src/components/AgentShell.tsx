import Link from "next/link";
import type { SignedInAgent } from "@/server/auth";

/**
 * Agent chrome, phone first: a slim header and a bottom tab bar within thumb
 * reach. Sections land here as they are built.
 */
const TABS = [
  { href: "/", label: "Home" },
  { href: "/customers", label: "Customers" },
  { href: "/earnings", label: "Earnings" },
  { href: "/payouts", label: "Payouts" },
  { href: "/profile", label: "Profile" },
];

export function AgentShell({ agent, children }: { agent: SignedInAgent; children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <span className="font-semibold tracking-tight">CANVEXIA Agents</span>
          <form action="/logout" method="post">
            <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {agent.status === "pending" && (
        <p className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
          Your application is being reviewed. Your code starts working once an admin approves it.
        </p>
      )}
      {agent.status === "suspended" && (
        <p className="border-b border-red-300 bg-red-50 px-4 py-3 text-center text-sm text-red-900">
          Your account is suspended. New sign-ups with your code are not credited to you. Commission
          already earned is unaffected.
        </p>
      )}

      <main className="mx-auto max-w-lg px-4 py-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="flex-1 py-3 text-center text-xs font-medium text-slate-700 hover:bg-slate-50 sm:text-sm"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
