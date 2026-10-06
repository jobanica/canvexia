import { AgentNav } from "./AgentNav";
import type { SignedInAgent } from "@/server/auth";

/**
 * Agent chrome, phone first and dark: the page on a deep violet background
 * and a floating tab bar within thumb reach. Pages written with the light
 * utility classes are recoloured by the .agent-shell rules in globals.css.
 */
export function AgentShell({ agent, children }: { agent: SignedInAgent; children: React.ReactNode }) {
  return (
    <div className="agent-shell min-h-screen bg-[#0f0d18] bg-[radial-gradient(ellipse_at_top,_#2a1f4d_0%,_#0f0d18_55%)] pb-28 text-slate-100">
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
