import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getOrderHistory, getItemsSold } from "@/server/orders/history";
import { parseReportRange } from "@/lib/time/report-range";
import { formatPeso } from "@/lib/money";
import { ORDER_TYPES, ORDER_TYPE_LABEL, isOrderType, type OrderTypeKey } from "@/lib/orders/order-type";
import { DateRangePicker } from "@/components/admin/DateRangePicker";
import { OrderHistoryList } from "@/components/admin/OrderHistoryList";
import { ItemsSoldPanel } from "@/components/admin/ItemsSoldPanel";

/**
 * Order history, in the app.
 *
 * The only way to look an order up used to be exporting a CSV and opening a
 * spreadsheet. That's fine at a desk and useless standing in the shop with a
 * customer asking about Tuesday — which is where the question actually gets
 * asked, on a phone, with one hand.
 */
export default async function OrdersHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    q?: string;
    type?: string;
    state?: string;
    page?: string;
  }>;
}) {
  const { restaurantId } = await requireAdminPage();
  const sp = await searchParams;
  const range = parseReportRange(sp);
  const type = isOrderType(sp.type ?? "") ? (sp.type as OrderTypeKey) : undefined;
  const state = sp.state;
  const page = Number(sp.page ?? 1) || 1;

  const filter = { from: range.from, to: range.to, q: sp.q, orderType: type, state };
  const [{ orders, totals, pageCount }, itemsSold] = await Promise.all([
    getOrderHistory(restaurantId, { ...filter, page }),
    getItemsSold(restaurantId, filter),
  ]);

  /** Keep every other filter when one of them changes. */
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const base = { ...sp, ...patch, page: undefined } as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    return `/admin/orders?${q.toString()}`;
  };

  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: String(n) })) if (v) q.set(k, String(v));
    return `/admin/orders?${q.toString()}`;
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold ${
      active ? "btn-brand text-white" : "border border-plum-ink/15 bg-white text-plum-ink/70"
    }`;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Order history</h1>
        <p className="text-sm text-plum-ink/50">
          Every order, any date. Tap one to see what was ordered and what was paid.
        </p>
      </div>

      <DateRangePicker range={range} basePath="/admin/orders" />

      {/* Totals for the whole range, not just this page. */}
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Orders" value={String(totals.orders)} />
        <Kpi label="Collected" value={formatPeso(totals.collected)} />
        <Kpi label="Discounts given" value={formatPeso(totals.discounts)} />
      </div>

      <form action="/admin/orders" className="flex flex-wrap gap-2">
        {/* Carry the current window through the search, or searching would
            silently reset the dates the owner just picked. */}
        {range.preset === "custom" ? (
          <>
            <input type="hidden" name="from" value={range.fromKey} />
            <input type="hidden" name="to" value={range.toKey} />
          </>
        ) : (
          <input type="hidden" name="range" value={range.preset} />
        )}
        {type && <input type="hidden" name="type" value={type} />}
        {state && <input type="hidden" name="state" value={state} />}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Order no., customer name or phone…"
          className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 bg-white px-3 py-2 text-sm"
        />
        <button className="rounded-full px-4 py-2 text-sm font-semibold btn-brand">Search</button>
        {sp.q && (
          <Link href={href({ q: undefined })} className="self-center text-xs font-semibold text-plum-ink/50 underline">
            clear
          </Link>
        )}
      </form>

      <div className="flex flex-wrap gap-1.5">
        <Link href={href({ type: undefined })} className={chip(!type)}>All types</Link>
        {ORDER_TYPES.map((t) => (
          <Link key={t} href={href({ type: t })} className={chip(type === t)}>
            {ORDER_TYPE_LABEL[t]}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link href={href({ state: undefined })} className={chip(!state)}>All</Link>
        <Link href={href({ state: "paid" })} className={chip(state === "paid")}>Paid</Link>
        <Link href={href({ state: "unpaid" })} className={chip(state === "unpaid")}>Unpaid</Link>
        <Link href={href({ state: "cancelled" })} className={chip(state === "cancelled")}>Voided</Link>
      </div>

      {/* What sold, before the individual tickets — it's the question most
          owners open this screen to answer. */}
      <ItemsSoldPanel data={itemsSold} />

      <div>
        <h2 className="mb-2 font-heading font-bold text-plum-ink">Orders</h2>
        <OrderHistoryList orders={orders} />
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-full border border-plum-ink/15 bg-white px-4 py-2 text-sm font-semibold">
              ← Newer
            </Link>
          ) : <span />}
          <span className="text-xs text-plum-ink/45">Page {page} of {pageCount}</span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="rounded-full border border-plum-ink/15 bg-white px-4 py-2 text-sm font-semibold">
              Older →
            </Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    // Three across even on a phone: stacked, they filled the whole first
    // screen and pushed the orders — the thing you came for — below the fold.
    <div className="min-w-0 rounded-tile border border-plum-ink/10 bg-white p-2.5">
      <p className="truncate text-[11px] font-medium text-plum-ink/50">{label}</p>
      <p className="font-heading text-base font-extrabold tabular-nums text-plum-ink sm:text-xl">
        {value}
      </p>
    </div>
  );
}
