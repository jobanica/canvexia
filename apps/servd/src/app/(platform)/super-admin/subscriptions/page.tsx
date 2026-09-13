import Link from "next/link";
import { listSubscriptions, listAllPlans, listCustomerHealth, listCustomDomainUnlocks, listActiveMonthlyFeatures, listQrAccess, type SubStatus, type SubscriptionRow, type CustomerHealth } from "@/server/billing/super-admin";
import { SubscriptionSearch } from "@/components/super-admin/SubscriptionSearch";
import {
  assignPlan,
  setSubscriptionStatus,
  extendTrial,
  compMonth,
  setRestaurantAccess,
  setToLite,
  setCustomDomainUnlock,
} from "@/server/billing/super-admin-actions";
import { isComplimentary } from "@/lib/billing/comp";
import { GrantAccessControl } from "@/components/super-admin/GrantAccessControl";
import { MonthlyFeatureControl } from "@/components/super-admin/MonthlyFeatureControl";
import { QrAccessControl } from "@/components/super-admin/QrAccessControl";
import { MONTHLY_FEATURES } from "@/server/billing/feature-subscriptions";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { TempPasswordButton } from "@/components/super-admin/TempPasswordButton";
import { addSmsCredits, setSenderName } from "@/server/sms/admin";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-mango/15 text-mango",
  trialing: "bg-brand-primary/10 text-brand-primary",
  past_due: "bg-guava/15 text-guava",
  cancelled: "bg-plum-ink/10 text-plum-ink/50",
};

function StatusBadge({ status }: { status: SubStatus | null }) {
  if (!status) return <span className="text-plum-ink/40">no sub</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? ""}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function fmtDate(iso: string | null) {
  return iso ? manilaDate(iso) : "—";
}

/** Monthly online-order cap implied by the plan name (null = unlimited). */
function capForPlan(planName: string | null): number | null {
  if (!planName) return 100;
  if (/lite/i.test(planName)) return 300;
  if (/free/i.test(planName)) return 100;
  return null; // Growth / Business / custom paid plans → unlimited
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" | "red" }) {
  const cls = {
    neutral: "bg-plum-ink/5 text-plum-ink/70",
    green: "bg-mango/15 text-mango",
    amber: "bg-amber-500/15 text-amber-700",
    red: "bg-guava/15 text-guava",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

/** Glanceable per-customer health: churn signal + this month + upsell trigger. */
function HealthStrip({ h, planName }: { h: CustomerHealth | undefined; planName: string | null }) {
  if (!h) return null;
  // Days since last order (the key churn signal).
  const days = h.lastOrderAt ? Math.floor((Date.now() - new Date(h.lastOrderAt).getTime()) / 86_400_000) : null;
  const lastTone = days == null ? "amber" : days <= 3 ? "green" : days <= 7 ? "amber" : "red";
  const lastLabel = days == null ? "🕒 no orders yet" : `🕒 last order ${days === 0 ? "today" : `${days}d ago`}`;

  // 30-day momentum vs the previous 30 days.
  let trend: React.ReactNode = null;
  if (h.ordersPrev30 > 0) {
    const pct = Math.round(((h.orders30 - h.ordersPrev30) / h.ordersPrev30) * 100);
    if (pct !== 0) trend = <Chip tone={pct > 0 ? "green" : "red"}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%</Chip>;
  }

  const cap = capForPlan(planName);
  const onlineTone = cap ? (h.onlineMtd >= cap * 0.9 ? "red" : h.onlineMtd >= cap * 0.7 ? "amber" : "neutral") : "neutral";

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <Chip tone={lastTone}>{lastLabel}</Chip>
      <Chip>📦 {h.ordersMtd} orders MTD</Chip>
      {trend}
      <Chip>💰 {formatPeso(h.gmvMtd)} MTD</Chip>
      <Chip tone={onlineTone}>🌐 {h.onlineMtd}{cap ? ` / ${cap}` : ""} online</Chip>
      {h.ratingCount > 0 && <Chip>⭐ {h.ratingAvg?.toFixed(1)} ({h.ratingCount})</Chip>}
    </div>
  );
}

/**
 * Applies the drill-down filter from the overview KPI tiles. Each tile links
 * here with a query param so the super-admin sees exactly which accounts sit
 * behind a headline number.
 */
function filterSubs(
  subs: SubscriptionRow[],
  q: { status?: string; access?: string; filter?: string },
): { rows: SubscriptionRow[]; label: string | null } {
  if (q.filter === "trials-ending") {
    const soon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return {
      rows: subs.filter(
        (s) => s.status === "trialing" && s.trialEndsAt != null && new Date(s.trialEndsAt).getTime() <= soon,
      ),
      label: "Trials ending within 7 days",
    };
  }
  if (q.access === "suspended") {
    return { rows: subs.filter((s) => s.restaurantStatus === "suspended"), label: "Suspended access" };
  }
  if (q.access === "active") {
    return { rows: subs.filter((s) => s.restaurantStatus === "active"), label: "Active access" };
  }
  if (q.status) {
    const wanted = q.status.split(",").map((x) => x.trim()).filter(Boolean);
    const pretty = wanted.map((x) => x.replace("_", " ")).join(" or ");
    return { rows: subs.filter((s) => s.status != null && wanted.includes(s.status)), label: pretty };
  }
  return { rows: subs, label: null };
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; access?: string; filter?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const [allSubs, plans, health, domainUnlocked, monthlyOn, qrAccess] = await Promise.all([
    listSubscriptions(),
    listAllPlans(),
    listCustomerHealth(),
    listCustomDomainUnlocks(),
    listActiveMonthlyFeatures(),
    listQrAccess(),
  ]);
  const activePlans = plans.filter((p) => p.isActive);
  const { rows: filtered, label: filterLabel } = filterSubs(allSubs, sp);

  // Free-text search on top of any status/access filter.
  const query = (sp.q ?? "").trim().toLowerCase();
  const subs = query
    ? filtered.filter(
        (s) =>
          s.restaurantName.toLowerCase().includes(query) || s.slug.toLowerCase().includes(query),
      )
    : filtered;

  const field = "rounded border border-plum-ink/15 px-2 py-1 text-xs";
  const btn = "rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold hover:bg-cream";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">Subscriptions</h1>
        {filterLabel ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-brand-primary/10 px-2.5 py-0.5 font-semibold capitalize text-brand-primary">
              {filterLabel}
            </span>
            <span className="text-plum-ink/50">
              {subs.length} of {allSubs.length} restaurants
            </span>
            <Link href="/super-admin/subscriptions" className="font-semibold text-brand-primary underline">
              Show all
            </Link>
          </div>
        ) : query ? (
          <p className="text-sm text-plum-ink/50">
            {subs.length} of {allSubs.length} restaurants matching “{sp.q}”.
          </p>
        ) : (
          <p className="text-sm text-plum-ink/50">
            {subs.length} restaurants. Change plans, force status, extend trials, comp months or
            suspend access.
          </p>
        )}
      </div>

      <SubscriptionSearch
        initial={sp.q ?? ""}
        keep={{ status: sp.status, access: sp.access, filter: sp.filter }}
      />

      <div className="space-y-3">
        {subs.length === 0 && (
          <p className="rounded-tile border border-dashed border-plum-ink/15 bg-white px-4 py-8 text-center text-sm text-plum-ink/50">
            {query ? `No restaurants match “${sp.q}”.` : "No restaurants in this group."}
          </p>
        )}
        {subs.map((s) => (
          <details key={s.restaurantId} className="rounded-tile border border-plum-ink/10 bg-white">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-[180px]">
                <p className="font-semibold">{s.restaurantName}</p>
                <p className="text-xs text-plum-ink/40">/{s.slug}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-plum-ink/60">
                <StatusBadge status={s.status} />
                {s.restaurantStatus === "suspended" && (
                  <span className="rounded-full bg-guava/15 px-2 py-0.5 font-semibold text-guava">
                    suspended
                  </span>
                )}
              </div>
              <div className="text-sm">{s.planName ?? "—"}</div>
              <div className="text-sm font-semibold">{formatPeso(s.priceMonthly)}/mo</div>
              <div className="text-xs text-plum-ink/50">
                {s.status === "trialing"
                  ? isComplimentary(s.trialEndsAt)
                    ? "full access · no end"
                    : `trial ends ${fmtDate(s.trialEndsAt)}`
                  : `renews ${fmtDate(s.currentPeriodEnd)}`}
              </div>
              <HealthStrip h={health.get(s.restaurantId)} planName={s.planName} />
            </summary>

            {/* Owner contact + login recovery */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-plum-ink/10 px-4 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-plum-ink/70">
                <span>✉️ {s.ownerEmail ?? (s.ownerUsername ? `@${s.ownerUsername} · username login` : "no email set")}</span>
                <span>📞 {s.ownerPhone ?? "—"}</span>
              </div>
              <TempPasswordButton restaurantId={s.restaurantId} className={btn} />
            </div>

            {/* Manual upgrade — full access, no payment */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-plum-ink/10 bg-brand-primary/5 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-plum-ink">
                  🎁 Grant full access — no payment
                  {s.status === "trialing" && isComplimentary(s.trialEndsAt) && (
                    <span className="ml-2 rounded-full bg-mango/15 px-2 py-0.5 text-[11px] font-semibold text-mango">
                      active
                    </span>
                  )}
                </p>
                <p className="text-xs text-plum-ink/55">
                  Unlocks every feature for free until you revoke — no card, never billed or suspended.
                </p>
              </div>
              <GrantAccessControl restaurantId={s.restaurantId} />
            </div>

            {/* Monthly add-ons. Separate block, because "full access" above
                genuinely does not include these — they're excluded from plan
                grants and from the trial unlock by design. */}
            <div className="border-t border-plum-ink/10 px-4 py-3">
              <MonthlyFeatureControl
                restaurantId={s.restaurantId}
                features={Object.entries(MONTHLY_FEATURES).map(([key, meta]) => ({
                  key,
                  label: meta.label,
                  priceMonthly: meta.priceMonthly,
                  active: monthlyOn.get(s.restaurantId)?.has(key) ?? false,
                }))}
              />

              <div className="mt-3 border-t border-plum-ink/10 pt-3">
                <QrAccessControl
                  restaurantId={s.restaurantId}
                  grandfathered={qrAccess.grandfathered.has(s.restaurantId)}
                  unlocked={qrAccess.unlocked.has(s.restaurantId)}
                />
              </div>
            </div>

            <div className="grid gap-4 border-t border-plum-ink/10 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Plan */}
              <form action={assignPlan} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">Plan</label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <select name="planId" defaultValue={s.planId ?? ""} className={field}>
                    {activePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {formatPeso(p.priceMonthly)}
                      </option>
                    ))}
                  </select>
                  <button className={btn}>Assign</button>
                </div>
              </form>

              {/* Status */}
              <form action={setSubscriptionStatus} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">Status</label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <select name="status" defaultValue={s.status ?? "active"} className={field}>
                    <option value="active">active</option>
                    <option value="trialing">trialing</option>
                    <option value="past_due">past due</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                  <button className={btn}>Set</button>
                </div>
              </form>

              {/* Extend trial */}
              <form action={extendTrial} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">Extend trial</label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <input name="days" type="number" min="1" max="365" defaultValue="14" className={`${field} w-16`} />
                  <span className="self-center text-xs text-plum-ink/40">days</span>
                  <button className={btn}>Extend</button>
                </div>
              </form>

              {/* Comp + access */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">Actions</label>
                <div className="flex flex-wrap gap-1">
                  <form action={compMonth}>
                    <input type="hidden" name="restaurantId" value={s.restaurantId} />
                    <button className={btn}>Comp 1 month</button>
                  </form>
                  <form action={setRestaurantAccess}>
                    <input type="hidden" name="restaurantId" value={s.restaurantId} />
                    <input
                      type="hidden"
                      name="access"
                      value={s.restaurantStatus === "suspended" ? "active" : "suspended"}
                    />
                    <button className={btn}>
                      {s.restaurantStatus === "suspended" ? "Restore access" : "Suspend access"}
                    </button>
                  </form>
                  {/* Hidden save offer — one tap assigns Lite (₱299 / 300 orders) + activates. */}
                  <form action={setToLite}>
                    <input type="hidden" name="restaurantId" value={s.restaurantId} />
                    <ConfirmSubmitButton
                      confirmText={`Put "${s.restaurantName}" on the Lite save plan (₱299 · 300 orders/mo, online payments) and activate it now?`}
                      className={`${btn} border-brand-primary/40 text-brand-primary`}
                    >
                      Set to Lite
                    </ConfirmSubmitButton>
                  </form>
                  {/* Custom-domain unlock — grant by hand when someone paid but
                      the gateway webhook never landed, or to comp it. */}
                  <form action={setCustomDomainUnlock}>
                    <input type="hidden" name="restaurantId" value={s.restaurantId} />
                    <input type="hidden" name="grant" value={domainUnlocked.has(s.restaurantId) ? "0" : "1"} />
                    <ConfirmSubmitButton
                      confirmText={
                        domainUnlocked.has(s.restaurantId)
                          ? `Revoke the custom-domain unlock for "${s.restaurantName}"?`
                          : `Unlock custom domain for "${s.restaurantName}" without payment? Use this when they've already paid.`
                      }
                      className={`${btn} ${domainUnlocked.has(s.restaurantId) ? "border-plum-ink/20 text-plum-ink/60" : "border-brand-primary/40 text-brand-primary"}`}
                    >
                      {domainUnlocked.has(s.restaurantId) ? "🔓 Domain unlocked" : "🔒 Unlock domain"}
                    </ConfirmSubmitButton>
                  </form>
                </div>
                {s.failedCharges > 0 && (
                  <p className="text-[11px] text-guava">{s.failedCharges} failed charge(s)</p>
                )}
              </div>

              {/* SMS credits */}
              <form action={addSmsCredits} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">
                  SMS credits ({s.smsCreditBalance})
                </label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <input name="amount" type="number" min="1" placeholder="100" className={`${field} w-20`} />
                  <button className={btn}>Add</button>
                </div>
              </form>

              {/* Sender name */}
              <form action={setSenderName} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">SMS sender</label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <input
                    name="senderName"
                    defaultValue={s.smsSenderName ?? ""}
                    maxLength={11}
                    placeholder="SENDER"
                    className={`${field} w-24`}
                  />
                  <button className={btn}>Set</button>
                </div>
              </form>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
