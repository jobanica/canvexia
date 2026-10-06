import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedIn } from "@/server/auth";
import { agentDb } from "@/server/scoped-db";
import { AgentShell } from "@/components/AgentShell";
import { agentHomeStats } from "@/server/stats";
import { peso } from "@/lib/money";
import { manilaDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const who = await getSignedIn();

  if (!who) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">CANVEXIA Agents</h1>
        <p className="mt-3 text-slate-600">
          Refer businesses to Servd and other CANVEXIA products. Earn on their activation and on
          every month they pay.
        </p>
        <div className="mt-8 space-y-3">
          <Link href="/apply" className="block rounded-md bg-slate-900 px-4 py-3 text-center font-medium text-white">
            Apply to be an agent
          </Link>
          <Link href="/login" className="block rounded-md border border-slate-300 px-4 py-3 text-center font-medium">
            Sign in
          </Link>
        </div>
      </main>
    );
  }
  if (who.kind === "staff") redirect("/admin");
  if (who.status === "removed") redirect("/login");

  // Through agentDb: Postgres returns this agent's customers and no one else's.
  const counts = await agentDb(who.agentId, (tx) =>
    tx.agentReferral.groupBy({ by: ["status"], _count: { _all: true } }),
  );
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const stats = await agentHomeStats(who.agentId);

  return (
    <AgentShell agent={who}>
      <h1 className="text-xl font-semibold">Hi, {who.name.split(" ")[0]}</h1>

      <section className="mt-4 rounded-xl bg-slate-900 p-5 text-white">
        <p className="text-xs uppercase tracking-wider text-slate-300">Your referral code</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-widest">{who.referralCode}</p>
        {who.status === "active" && (
          <Link href="/share" className="mt-4 inline-block rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900">
            Share your link and QR
          </Link>
        )}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        {[
          ["Earned this month", peso(stats.thisMonth)],
          ["Waiting for release", peso(stats.pendingRelease)],
          ["Receipts awaiting verification", String(stats.awaitingVerification)],
          ["Next payout", manilaDate(stats.nextPayout)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-lg font-semibold">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </section>
      <p className="mt-2 text-xs text-slate-500">
        {peso(stats.unpaidBalance)} is ready for your next payout. Balances under {peso(stats.payoutMinimum)} carry
        over to the following month.
      </p>

      <section className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          ["Signed up", count("lead")],
          ["Paying", count("active")],
          ["Cancelled", count("churned")],
        ].map(([label, n]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-2xl font-semibold">{n}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </section>
    </AgentShell>
  );
}
