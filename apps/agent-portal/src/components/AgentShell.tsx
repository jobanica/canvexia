import { AgentNav } from "./AgentNav";
import { NavDrawer } from "./NavDrawer";
import { NavLinks, type NavLink } from "./NavLinks";
import { Icon } from "./icons";
import type { SignedInAgent } from "@/server/auth";

const NAV: NavLink[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/customers", label: "My customers", icon: "users" },
  { href: "/earnings", label: "Earnings", icon: "chart" },
  { href: "/payouts", label: "Payouts", icon: "wallet" },
  { href: "/profile", label: "Profile", icon: "user" },
];

/**
 * Agent chrome, phone first and dark: a slim bar with the menu, the page on a
 * deep violet background, and a floating tab bar within thumb reach. The five
 * tabs are the everyday ones; the drawer carries the same list plus sharing
 * and sign-out. Pages written with the light utility classes are recoloured by
 * the .agent-shell rules in globals.css.
 */
export function AgentShell({ agent, children }: { agent: SignedInAgent; children: React.ReactNode }) {
  // Sharing a link only works once the code is live, same rule as the home page.
  const links = agent.status === "active" ? [...NAV, { href: "/share", label: "Share my link", icon: "share" as const }] : NAV;

  return (
    <div className="agent-shell min-h-screen bg-[#0f0d18] bg-[radial-gradient(ellipse_at_top,_#2a1f4d_0%,_#0f0d18_55%)] pb-28 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0f0d18]/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <NavDrawer
            panelClassName="bg-[#1a1630] text-slate-100"
            buttonClassName="h-9 w-9 text-[#c9bbff] hover:bg-white/10"
          >
            <div className="flex items-center gap-2 px-5 pb-6 pt-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#7c5cf5] to-[#3b2a8c] text-sm font-bold text-white">C</span>
              <span className="text-sm font-semibold tracking-wide">CANVEXIA Agents</span>
            </div>
            <NavLinks links={links} />
            <form action="/logout" method="post" className="mt-auto px-3 pb-4">
              <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">
                <Icon name="logout" className="h-[18px] w-[18px]" />
                Sign out
              </button>
            </form>
          </NavDrawer>
          <span className="text-sm font-semibold tracking-wide text-white">CANVEXIA Agents</span>
        </div>
      </header>

      {agent.status === "pending" && (
        <p className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
          Your application is being reviewed. Your code starts working once an admin approves it.
        </p>
      )}
      {agent.status === "suspended" && (
        <p className="border-b border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">
          Your account is suspended. New sign-ups with your code are not credited to you. Commission
          already earned is unaffected.
        </p>
      )}

      <main className="mx-auto max-w-lg px-4 py-5">{children}</main>

      <AgentNav />
    </div>
  );
}
