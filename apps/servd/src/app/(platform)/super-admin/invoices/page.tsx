import { listInvoices } from "@/server/billing/super-admin";
import { markInvoicePaid, voidInvoice } from "@/server/billing/super-admin-actions";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-mango/15 text-mango",
  open: "bg-brand-primary/10 text-brand-primary",
  failed: "bg-guava/15 text-guava",
  void: "bg-plum-ink/10 text-plum-ink/50",
};

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  const outstanding = invoices
    .filter((i) => i.status === "open" || i.status === "failed")
    .reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">Invoices</h1>
        <p className="text-sm text-plum-ink/50">
          Subscription invoices across all tenants. Outstanding:{" "}
          <span className="font-semibold text-plum-ink">{formatPeso(outstanding)}</span>
        </p>
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-plum-ink/50">No invoices yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr className="border-b border-plum-ink/10">
                <th className="px-4 py-2">Restaurant</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-t border-plum-ink/5">
                  <td className="px-4 py-2 font-medium">{i.restaurantName}</td>
                  <td className="px-4 py-2 text-right font-semibold">{formatPeso(i.amount)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[i.status] ?? ""}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-plum-ink/50">
                    {manilaDate(i.periodStart)} – {manilaDate(i.periodEnd)}
                  </td>
                  <td className="px-4 py-2 text-xs text-plum-ink/50">
                    {manilaDate(i.createdAt)}
                  </td>
                  <td className="px-4 py-2">
                    {(i.status === "open" || i.status === "failed") && (
                      <div className="flex gap-1">
                        <form action={markInvoicePaid}>
                          <input type="hidden" name="id" value={i.id} />
                          <button className="rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold hover:bg-cream">
                            Mark paid
                          </button>
                        </form>
                        <form action={voidInvoice}>
                          <input type="hidden" name="id" value={i.id} />
                          <button className="rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold text-plum-ink/50 hover:bg-cream">
                            Void
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
