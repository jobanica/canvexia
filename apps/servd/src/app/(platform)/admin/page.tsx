import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getAnalytics } from "@/server/analytics/queries";
import { getFeedbackList } from "@/server/feedback/queries";
import { listInventory } from "@/server/inventory/queries";
import { hasModule } from "@/server/billing/entitlements";
import { getPlanBannerData } from "@/server/billing/plan-status";
import { PlanStatusBanner } from "@/components/billing/PlanStatusBanner";
import { formatPeso } from "@/lib/money";
import { manilaStartOfDay, manilaStartOfDaysAgo } from "@/lib/time/manila";
import { RevenueChart } from "@/components/analytics/Charts";
import { hasTutorials } from "@/server/tutorials/tutorials";

/** Resolves a promise, returning a fallback if it throws (schema-lag safe). */
/**
 * Keep one failed panel from taking the whole dashboard down.
 *
 * It logs, and that matters. This used to swallow the error and hand back a
 * fallback, so a query that was failing outright rendered as "₱0.00 · 0 orders"
 * — a number indistinguishable from a quiet morning. Nobody can debug a figure
 * that lies quietly. Callers that show money pass null and render a visible
 * "couldn't load" instead of a zero.
 */
async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error(`[dashboard] ${label} failed:`, e);
    return fallback;
  }
}

function Card({ title, href, children, className = "" }: { title?: string; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-tile border border-plum-ink/10 bg-white p-5 ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">{title}</h2>
          {href && <Link href={href} className="text-xs font-semibold text-brand-primary">View →</Link>}
        </div>
      )}
      {children}
    </div>
  );
}

function Kpi({ label, value, hint, href, accent }: { label: string; value: string; hint?: string; href?: string; accent?: boolean }) {
  const inner = (
    <div className={`h-full rounded-tile border p-5 ${accent ? "border-guava bg-guava/5" : "border-plum-ink/10 bg-white"} ${href ? "transition hover:border-brand-primary" : ""}`}>
      <p className={`text-xs font-medium ${accent ? "text-guava" : "text-plum-ink/50"}`}>{label}</p>
      <p className={`mt-1 font-heading text-3xl font-extrabold ${accent ? "text-guava" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-plum-ink/40">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function Stars({ n }: { n: number }) {
  return <span><span className="text-mango">{"★".repeat(n)}</span><span className="text-plum-ink/20">{"★".repeat(5 - n)}</span></span>;
}

const OPEN = ["new", "preparing", "done"] as const;

export default async function AdminHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") redirect("/login");
  const rid = user.restaurantId;

  const restaurant = await tenantDb(rid, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: { name: true, displayName: true, slug: true, status: true, onboardingCompletedAt: true },
    }),
  );
  if (restaurant.status === "suspended") redirect("/admin/billing");
  if (!restaurant.onboardingCompletedAt) redirect("/admin/onboarding");

  const now = new Date();
  // Manila day boundaries — the server runs in UTC, so a plain setHours(0,0,0,0)
  // would start "today" at 8 AM Manila and drop the early-morning trade.
  const startOfDay = manilaStartOfDay(now);
  const weekAgo = manilaStartOfDaysAgo(7, now);

  const inventoryOn = await safe("inventory module", hasModule(rid, "inventory"), false);
  // Cached platform-wide, so this is not a per-dashboard query.
  const tutorialsReady = await hasTutorials();

  const [today, week, counts, recent, feedback, lowStock] = await Promise.all([
    safe("today", getAnalytics(rid, startOfDay, now), null),
    safe("week", getAnalytics(rid, weekAgo, now), null),
    safe(
      "counts",
      tenantDb(rid, async (tx) => {
        const [pending, open, preparing, ready, tables, activeTables] = await Promise.all([
          tx.order.count({ where: { status: "pending" } }),
          tx.order.count({ where: { status: { in: [...OPEN] } } }),
          tx.order.count({ where: { status: "preparing" } }),
          tx.order.count({ where: { status: "done" } }),
          tx.table.count(),
          tx.order.findMany({ where: { status: { in: [...OPEN] } }, select: { tableId: true }, distinct: ["tableId"] }),
        ]);
        return { pending, open, preparing, ready, tables, activeTables: activeTables.length };
      }),
      { pending: 0, open: 0, preparing: 0, ready: 0, tables: 0, activeTables: 0 },
    ),
    safe(
      "recent orders",
      tenantDb(rid, (tx) =>
        tx.order.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true, status: true, paymentStatus: true, total: true, createdAt: true,
            table: { select: { tableNumber: true } },
            _count: { select: { items: true } },
          },
        }),
      ),
      [] as Array<{ id: string; status: string; paymentStatus: string; total: number; createdAt: Date; table: { tableNumber: string } | null; _count: { items: number } }>,
    ),
    safe("feedback", getFeedbackList(rid), [] as Awaited<ReturnType<typeof getFeedbackList>>),
    inventoryOn ? safe("inventory", listInventory(rid), []) : Promise.resolve([]),
  ]);

  const lowItems = lowStock.filter((i) => i.low).slice(0, 5);

  // Today at a glance — four facts read straight off the week's figures.
  //
  // These used to be the fallback for a Claude-generated version, which was
  // removed: it cost a paid API call on every dashboard load, took a second to
  // arrive, and said less than these four lines do. Everything here comes from
  // numbers the page has already fetched, so it is instant and always the same
  // for the same data.
  const insights: string[] = [];
  if (week?.topItems[0]) insights.push(`🔥 Best seller this week: ${week.topItems[0].name} (${week.topItems[0].qty} sold)`);
  if (week && week.peakHours.length) {
    const peak = [...week.peakHours].sort((a, b) => b.orders - a.orders)[0];
    insights.push(`⏰ Busiest hour: ${peak.hour}:00 (UTC)`);
  }
  if (lowItems.length) insights.push(`📦 ${lowItems.length} ingredient${lowItems.length > 1 ? "s" : ""} running low`);
  if (week?.summary.avgRating != null) insights.push(`⭐ 7-day average rating: ${week.summary.avgRating}`);
  if (insights.length === 0) insights.push("Add menu items and share your table QR codes to start seeing insights here.");

  // Orders taken today that revenue can't see yet, because nothing has been
  // collected against them.
  const unsettledToday = Math.max(0, (today?.summary.placedOrders ?? 0) - (today?.summary.orders ?? 0));

  // Unified plan-status banner (trial countdown + Free-tier order cap).
  const bannerData = await safe("plan banner", getPlanBannerData(rid), null);

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-bold break-words">{restaurant.displayName || restaurant.name}</h1>
        <p className="text-sm text-plum-ink/55">Here&apos;s how today is going.</p>
      </div>

      {bannerData && <PlanStatusBanner surface="dashboard" data={bannerData} />}

      {/* Top row — KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Pending acceptance"
          value={String(counts.pending)}
          hint={counts.pending > 0 ? "Tap to accept in cashier" : "QR orders awaiting accept"}
          href="/cashier"
          accent={counts.pending > 0}
        />
        {/* A failed query renders "—", never "₱0.00". A zero that means "the
            figure didn't load" is worse than no figure at all: it reads as a
            day with no sales, and there's nothing to tell the two apart. */}
        <Kpi
          label="Revenue today"
          value={today ? formatPeso(today.summary.revenue) : "—"}
          hint={today ? "Paid orders" : "Couldn't load — try reloading"}
        />
        <Kpi
          label="Orders today"
          value={today ? String(today.summary.orders) : "—"}
          hint={
            !today
              ? "Couldn't load — try reloading"
              : unsettledToday > 0
                // The case that looks like a bug and isn't: the order was taken,
                // the money hasn't landed, and revenue only counts money.
                ? `Paid · ${unsettledToday} more placed, not settled yet`
                : "Paid and settled"
          }
          href={unsettledToday > 0 ? "/cashier" : undefined}
          accent={unsettledToday > 0}
        />
        <Kpi label="Open orders" value={String(counts.open)} hint="Awaiting / cooking / to settle" />
        <Kpi label="Avg rating today" value={today?.summary.avgRating != null ? `${today.summary.avgRating} ★` : "—"} />
      </div>

      {/* Second row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Revenue (7 days)" href="/admin/analytics" className="lg:col-span-2">
          {week ? <RevenueChart data={week.revenueByDay} /> : <p className="py-10 text-center text-sm text-plum-ink/40">No data yet.</p>}
        </Card>
        <Card title="Popular items" href="/admin/analytics">
          {week && week.topItems.length ? (
            <ul className="space-y-2 text-sm">
              {week.topItems.map((it) => (
                <li key={it.name} className="flex justify-between">
                  <span className="truncate">{it.name}</span>
                  <span className="font-semibold text-plum-ink/60">×{it.qty}</span>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-center text-sm text-plum-ink/40">No sales yet.</p>}
        </Card>
      </div>

      {/* Third row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Kitchen" href="/kitchen">
          <div className="grid grid-cols-3 text-center">
            {[["New", counts.open - counts.preparing - counts.ready], ["Cooking", counts.preparing], ["Ready", counts.ready]].map(([l, v]) => (
              <div key={l as string}>
                <p className="font-heading text-2xl font-extrabold">{Math.max(0, v as number)}</p>
                <p className="text-xs text-plum-ink/50">{l}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Tables" href="/admin/tables">
          <p className="font-heading text-2xl font-extrabold">{counts.activeTables}<span className="text-plum-ink/40"> / {counts.tables}</span></p>
          <p className="text-xs text-plum-ink/50">tables with open orders</p>
        </Card>
        <Card title="Feedback" href="/admin/feedback">
          {feedback.length ? (
            <ul className="space-y-2 text-sm">
              {feedback.slice(0, 3).map((f) => (
                <li key={f.id}>
                  <Stars n={f.rating} />
                  {f.comment && <span className="ml-1 text-plum-ink/60">“{f.comment.slice(0, 40)}”</span>}
                </li>
              ))}
            </ul>
          ) : <p className="py-4 text-center text-sm text-plum-ink/40">No feedback yet.</p>}
        </Card>
      </div>

      {/* Fourth row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Recent orders" className="lg:col-span-2">
          {recent.length ? (
            <ul className="divide-y divide-plum-ink/5 text-sm">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2">
                  <span>
                    Table {o.table?.tableNumber ?? "—"} · {o._count.items} item{o._count.items === 1 ? "" : "s"}
                    <span className="ml-2 text-xs text-plum-ink/40">{o.status} · {o.paymentStatus}</span>
                  </span>
                  <span className="font-semibold">{formatPeso(o.total)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-center text-sm text-plum-ink/40">No orders yet.</p>}
        </Card>
        <Card title="Inventory alerts" href={inventoryOn ? "/admin/inventory" : undefined}>
          {!inventoryOn ? (
            <p className="text-sm text-plum-ink/40">Inventory module off.</p>
          ) : lowItems.length ? (
            <ul className="space-y-1 text-sm">
              {lowItems.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span className="text-guava">{i.name}</span>
                  <span className="text-plum-ink/50">{i.stockQty} {i.unit}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-plum-ink/40">All stocked up ✓</p>}
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Today at a glance" className="lg:col-span-2">
          <ul className="space-y-2 text-sm text-plum-ink/75">
            {insights.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </Card>
        <Card title="Quick actions">
          <div className="space-y-2">
            <a href={`/r/${restaurant.slug}`} target="_blank" rel="noopener" className="block rounded-lg border border-brand-primary/30 bg-brand-primary/5 px-3 py-2 text-sm font-semibold text-brand-primary hover:border-brand-primary">
              🌐 View your online website <span className="opacity-40">→</span>
            </a>
            {/* Only offered once there's something to watch — a button that
                leads to "coming soon" teaches owners the link is worthless. */}
            {tutorialsReady && (
              <a href="/tutorials" target="_blank" rel="noopener" className="block rounded-lg border border-plum-ink/10 px-3 py-2 text-sm font-semibold hover:border-brand-primary">
                🎓 Watch tutorials <span className="text-plum-ink/30">→</span>
              </a>
            )}
            {[["Add a menu item", "/admin/menu"], ["Print table QR", "/admin/tables"], ["Add staff login", "/admin/staff"]].map(([l, h]) => (
              <Link key={h} href={h} className="block rounded-lg border border-plum-ink/10 px-3 py-2 text-sm font-semibold hover:border-brand-primary">
                {l} <span className="text-plum-ink/30">→</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
