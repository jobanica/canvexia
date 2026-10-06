import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedIn } from "@/server/auth";
import { agentDb } from "@/server/scoped-db";
import { AgentShell } from "@/components/AgentShell";
import { Icon, type IconName } from "@/components/icons";
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
  const [counts, recentCustomers, recentCommissions] = await agentDb(who.agentId, (tx) =>
    Promise.all([
      tx.agentReferral.groupBy({ by: ["status"], _count: { _all: true } }),
      tx.agentReferral.findMany({
        orderBy: { signedUpAt: "desc" },
        take: 5,
        select: { id: true, businessName: true, signedUpAt: true },
      }),
      tx.agentCommission.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, amount: true, kind: true, createdAt: true, referral: { select: { businessName: true } } },
      }),
    ]),
  );
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const stats = await agentHomeStats(who.agentId);

  const cards: { label: string; value: string; icon: IconName; href: string }[] = [
    { label: "Earned this month", value: peso(stats.thisMonth), icon: "peso", href: "/earnings" },
    { label: "Paying customers", value: String(count("active")), icon: "users", href: "/customers" },
    { label: "Waiting for release", value: peso(stats.pendingRelease), icon: "clock", href: "/earnings" },
    { label: "Next payout", value: manilaDate(stats.nextPayout), icon: "wallet", href: "/payouts" },
  ];

  const actions: { label: string; icon: IconName; href: string }[] = [
    ...(who.status === "active" ? [{ label: "Share my link", icon: "share" as const, href: "/share" }] : []),
    { label: "My customers", icon: "users", href: "/customers" },
    { label: "View earnings", icon: "chart", href: "/earnings" },
    { label: "Payouts", icon: "wallet", href: "/payouts" },
  ];

  const activity = [
    ...recentCustomers.map((r) => ({
      id: `r-${r.id}`,
      at: r.signedUpAt,
      icon: "store" as const,
      title: `${r.businessName} signed up`,
      href: `/customers/${r.id}`,
    })),
    ...recentCommissions.map((c) => ({
      id: `c-${c.id}`,
      at: c.createdAt,
      icon: "peso" as const,
      title: `${peso(c.amount)} ${c.kind === "reversal" ? "reversed" : `${c.kind} commission`} · ${c.referral.businessName}`,
      href: "/earnings",
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  return (
    <AgentShell agent={who}>
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#7c5cf5] to-[#3b2a8c] text-base font-semibold uppercase text-white ring-2 ring-white/10">
          {who.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-[#a5a1c2]">Welcome back,</p>
          <p className="truncate text-lg font-semibold text-white">{who.name}</p>
        </div>
        <form action="/logout" method="post" className="ml-auto">
          <button
            type="submit"
            aria-label="Sign out"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-[#a5a1c2] hover:text-white"
          >
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </form>
      </header>

      <section className="mt-5 rounded-2xl border border-white/10 bg-gradient-to-br from-[#2d2357] to-[#1a1630] p-4">
        <p className="text-xs text-[#a5a1c2]">Your referral code</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-widest text-white">{who.referralCode}</p>
        <p className="mt-1 text-xs text-[#a5a1c2]">
          {count("lead")} signed up · {count("active")} paying · {count("churned")} cancelled
        </p>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 pb-12 backdrop-blur">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[#c9bbff]">
              <Icon name={c.icon} className="h-[18px] w-[18px]" />
            </span>
            <p className="mt-3 text-xs text-[#a5a1c2]">{c.label}</p>
            <p className="mt-0.5 truncate text-xl font-semibold text-white">{c.value}</p>
            <Link
              href={c.href}
              className="absolute bottom-0 right-0 flex items-center gap-1 rounded-tl-2xl bg-white/10 px-3 py-1.5 text-[11px] text-white hover:bg-white/20"
            >
              See more <Icon name="arrow" className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </section>
      <p className="mt-2 text-xs text-[#a5a1c2]">
        {peso(stats.unpaidBalance)} is ready for your next payout · {stats.awaitingVerification} receipt
        {stats.awaitingVerification === 1 ? "" : "s"} awaiting verification. Balances under {peso(stats.payoutMinimum)} carry
        over.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-white">Quick actions</h2>
        <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
          {actions.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white hover:bg-white/10"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">
                <Icon name={a.icon} className="h-4 w-4" />
              </span>
              {a.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Recent activity</h2>
          <Link href="/customers" className="text-xs text-[#a5a1c2] hover:text-white">View all</Link>
        </div>
        <ul className="mt-3 space-y-2">
          {activity.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 hover:bg-white/[0.08]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-[#c9bbff]">
                  <Icon name={a.icon} className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{a.title}</p>
                  <p className="text-xs text-[#a5a1c2]">{manilaDate(a.at)}</p>
                </div>
              </Link>
            </li>
          ))}
          {activity.length === 0 && (
            <li className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-[#a5a1c2]">
              Nothing yet. Share your link and your first sign-up will show here.
            </li>
          )}
        </ul>
      </section>
    </AgentShell>
  );
}
