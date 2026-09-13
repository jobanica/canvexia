import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { formatPeso } from "@/lib/money";
import {
  listAdvanceOrders,
  approveAdvanceOrder,
  declineAdvanceOrder,
  setDownpaymentPaid,
  sendAdvanceToKitchen,
  type AdvanceOrder,
} from "@/server/orders/advance-orders";

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdvanceOrdersPage() {
  const { restaurantId } = await requireAdminPage();
  const orders = await listAdvanceOrders(restaurantId);

  const awaiting = orders.filter((o) => o.approvalStatus === "awaiting" && o.status !== "cancelled");
  const approved = orders.filter((o) => o.approvalStatus === "approved" && o.status !== "cancelled" && o.status !== "closed");
  const done = orders.filter((o) => o.status === "cancelled" || o.status === "closed" || o.approvalStatus === "declined");

  function Card({ o }: { o: AdvanceOrder }) {
    const balance = Math.max(0, o.total - (o.downpaymentPaid ? o.downpaymentAmount : 0));
    return (
      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-mango/15 px-2.5 py-0.5 text-xs font-bold text-mango">📅 {when(o.scheduledFor)}</span>
              <span className="text-xs font-semibold text-plum-ink/60">
                {o.orderType === "delivery" ? "🛵 Delivery" : "🥡 Pickup"}
              </span>
              {o.status !== "pending" && (
                <span className="rounded-full bg-plum-ink/5 px-2 py-0.5 text-xs text-plum-ink/60">{o.status}</span>
              )}
            </div>
            <p className="mt-1 font-heading font-bold">{o.customerName ?? "Customer"}</p>
            <p className="text-xs text-plum-ink/55">
              {o.customerPhone ?? "no phone"}
              {o.orderType === "delivery" && o.customerAddress ? ` · ${o.customerAddress}` : ""}
              {` · ${o.ref}`}
            </p>
          </div>
          <div className="text-right">
            <p className="font-heading text-lg font-extrabold">{formatPeso(o.total)}</p>
          </div>
        </div>

        {/* Items */}
        <ul className="mt-3 space-y-0.5 border-t border-plum-ink/5 pt-3 text-sm text-plum-ink/75">
          {o.items.map((it, i) => (
            <li key={i}>
              {it.quantity}× {it.name}
              {it.modifiers.length > 0 && <span className="text-plum-ink/45"> · {it.modifiers.join(", ")}</span>}
              {it.note && <span className="text-plum-ink/45"> — “{it.note}”</span>}
            </li>
          ))}
        </ul>

        {/* Downpayment */}
        {o.downpaymentAmount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-cream/60 px-3 py-2 text-sm">
            <span className="font-semibold text-plum-ink">Downpayment {formatPeso(o.downpaymentAmount)}</span>
            {o.downpaymentRef && <span className="text-plum-ink/60">Ref: <span className="font-mono">{o.downpaymentRef}</span></span>}
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.downpaymentPaid ? "bg-green-100 text-green-700" : "bg-guava/15 text-guava"}`}>
              {o.downpaymentPaid ? "✓ Received" : "Not yet received"}
            </span>
            <form action={setDownpaymentPaid} className="ml-auto">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="paid" value={o.downpaymentPaid ? "false" : "true"} />
              <button className="rounded-lg border border-plum-ink/15 px-2.5 py-1 text-xs font-semibold">
                {o.downpaymentPaid ? "Mark unpaid" : "Mark received"}
              </button>
            </form>
            <span className="w-full text-xs text-plum-ink/50">Balance on {o.orderType === "delivery" ? "delivery" : "pickup"}: {formatPeso(balance)}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {o.approvalStatus === "awaiting" && (
            <form action={approveAdvanceOrder}>
              <input type="hidden" name="id" value={o.id} />
              <button className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white">✓ Approve</button>
            </form>
          )}
          {o.approvalStatus === "approved" && o.status === "pending" && (
            <form action={sendAdvanceToKitchen}>
              <input type="hidden" name="id" value={o.id} />
              <button className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white">→ Send to kitchen</button>
            </form>
          )}
          {o.status !== "cancelled" && o.status !== "closed" && (
            <form action={declineAdvanceOrder} className="flex items-center gap-1">
              <input type="hidden" name="id" value={o.id} />
              <input name="reason" placeholder="Reason (optional)" className="w-40 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-xs" />
              <button className="text-xs text-muted hover:text-guava">Decline</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  function Section({ title, subtitle, list, empty }: { title: string; subtitle?: string; list: AdvanceOrder[]; empty: string }) {
    return (
      <div>
        <h2 className="mb-1 font-heading text-lg font-bold">{title} {list.length > 0 && <span className="text-plum-ink/40">({list.length})</span>}</h2>
        {subtitle && <p className="mb-2 text-xs text-plum-ink/50">{subtitle}</p>}
        <div className="space-y-3">
          {list.length === 0 ? <p className="text-sm text-plum-ink/50">{empty}</p> : list.map((o) => <Card key={o.id} o={o} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Advance orders</h1>
        <p className="text-sm text-plum-ink/50">
          Orders placed on your website for a future date/time. Review each (and any downpayment),
          then approve — approved orders stay here until you send them to the kitchen.
        </p>
      </div>

      <Section
        title="Awaiting approval"
        subtitle="New advance orders. Verify the downpayment (if any), then approve or decline."
        list={awaiting}
        empty="Nothing waiting for approval."
      />
      <Section
        title="Approved — upcoming"
        subtitle="Confirmed. Hit “Send to kitchen” when it's time to prepare."
        list={approved}
        empty="No approved advance orders yet."
      />
      {done.length > 0 && <Section title="Declined / done" list={done} empty="" />}
    </div>
  );
}
