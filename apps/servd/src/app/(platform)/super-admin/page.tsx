import Link from "next/link";
import { getSubscriptionMetrics } from "@/server/billing/super-admin";
import { getPlatformMetrics } from "@/server/analytics/platform";
import { getOrderCapEnabled } from "@/server/billing/platform-settings";
import { setGlobalOrderCap } from "@/server/billing/super-admin-actions";
import { FREE_WEB_ORDER_CAP } from "@/server/billing/order-cap";
import { capFor } from "@/lib/billing/planLimits";
import { formatPeso } from "@/lib/money";
import { BillingRunButton } from "@/components/super-admin/BillingRunButton";
import { getMonthlyFeatureUsage } from "@/server/billing/feature-subscriptions";

function Stat({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-plum-ink/50">{label}</p>
      <p className={`font-heading text-2xl font-extrabold ${accent ? "text-brand-primary" : ""}`}>{value}</p>
      {href && <p className="mt-1 text-[11px] font-semibold text-brand-primary/70">View accounts →</p>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-tile border border-plum-ink/10 bg-white p-4 transition hover:border-brand-primary/40 hover:shadow-sm"
      >
        {body}
      </Link>
    );
  }
  return <div className="rounded-tile border border-plum-ink/10 bg-white p-4">{body}</div>;
}

export default async function SuperAdminHome() {
  const [m, platform, capEnabled, scheduler] = await Promise.all([
    getSubscriptionMetrics(),
    getPlatformMetrics(),
    getOrderCapEnabled(),
      getMonthlyFeatureUsage("contentScheduler"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Overview</h1>
          <p className="text-sm text-plum-ink/50">Subscription health across the whole platform.</p>
        </div>
        <Link
          href="/super-admin/subscriptions"
          className="rounded-full px-4 py-2 text-sm font-semibold btn-brand"
        >
          Manage subscriptions →
        </Link>
      </div>

      {/* Global order-cap master switch */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-tile border p-4 ${capEnabled ? "border-amber-500/40 bg-amber-500/5" : "border-mango/40 bg-mango/10"}`}>
        <div className="min-w-[240px] flex-1">
          <p className="font-heading text-base font-bold">
            Monthly order cap: {capEnabled ? "ON" : "OFF"}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${capEnabled ? "bg-amber-500/20 text-amber-700" : "bg-mango/20 text-mango"}`}>
              {capEnabled ? "capping active" : "everyone unlimited"}
            </span>
          </p>
          <p className="mt-1 text-sm text-plum-ink/60">
            {capEnabled
              ? `Free is capped at ${capFor("starter")} and Lite at ${capFor("lite")} orders/month (QR + online, counted together). Paid plans stay unlimited.`
              : `All restaurants have unlimited orders. Turn this on later (e.g. once you have enough subscribers) to enforce ${FREE_WEB_ORDER_CAP}/mo on Free.`}
          </p>
        </div>
        <form action={setGlobalOrderCap}>
          <input type="hidden" name="enabled" value={(!capEnabled).toString()} />
          <button className={`rounded-full px-4 py-2 text-sm font-semibold ${capEnabled ? "border border-plum-ink/20 text-plum-ink" : "btn-brand"}`}>
            {capEnabled ? "Turn OFF — make unlimited" : "Turn ON order caps"}
          </button>
        </form>
      </div>

      {/* Revenue */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR (paying)" value={formatPeso(m.mrr)} accent href="/super-admin/subscriptions?status=active" />
        <Stat label="ARR (run-rate)" value={formatPeso(m.arr)} href="/super-admin/subscriptions?status=active" />
        <Stat label="MRR incl. trials" value={formatPeso(m.mrrWithTrials)} href="/super-admin/subscriptions?status=active,trialing" />
        <Stat label="Restaurants" value={m.total} href="/super-admin/subscriptions" />
      </div>

      {/* Subscription status */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active" value={m.active} href="/super-admin/subscriptions?status=active" />
        <Stat label="Trialing" value={m.trialing} href="/super-admin/subscriptions?status=trialing" />
        <Stat label="Past due" value={m.pastDue} href="/super-admin/subscriptions?status=past_due" />
        <Stat label="Cancelled" value={m.cancelled} href="/super-admin/subscriptions?status=cancelled" />
        <Stat label="Suspended" value={m.suspended} href="/super-admin/subscriptions?access=suspended" />
        <Stat label="Trials ending ≤7d" value={m.trialsEndingSoon} href="/super-admin/subscriptions?filter=trials-ending" />
      </div>

      {/* Usage */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Orders (30d)" value={platform.orders30} />
        <Stat label="SMS credits used" value={platform.smsCreditsUsed} />
        <Stat label="Active (access)" value={platform.activeRestaurants} href="/super-admin/subscriptions?access=active" />
      </div>

      {/* Content scheduler take-up — size the Upload-Post plan against this. */}
      <div>
        <h2 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/50">
          Content scheduler
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Paying now" value={scheduler.active} accent />
          <Stat label="Profiles in use" value={scheduler.connected} />
          <Stat label="Awaiting payment" value={scheduler.pending} />
          <Stat label="Lapsed" value={scheduler.lapsed} />
        </div>
        <p className="mt-2 text-xs text-plum-ink/50">
          <span className="font-semibold text-plum-ink/70">Profiles in use</span> is what your
          Upload-Post plan has to cover — a profile stays provisioned after a subscription lapses.
        </p>
      </div>

      <BillingRunButton />
    </div>
  );
}
