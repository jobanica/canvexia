import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getReorderSuggestions, type ReorderSuggestion } from "@/server/inventory/queries";
import { createPoFromSuggestions } from "@/server/inventory/actions";
import { formatPeso } from "@/lib/money";

export default async function ReorderPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "inventory", "Reorder");
  if (locked) return locked;

  const suggestions = await getReorderSuggestions(restaurantId);

  // Group by supplier.
  const groups = new Map<string, { supplierId: string | null; supplierName: string; rows: ReorderSuggestion[] }>();
  for (const s of suggestions) {
    const key = s.supplierId ?? "—";
    if (!groups.has(key)) groups.set(key, { supplierId: s.supplierId, supplierName: s.supplierName ?? "Unassigned", rows: [] });
    groups.get(key)!.rows.push(s);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/inventory" className="text-sm text-plum-ink/50">← Inventory</Link>
        <h1 className="font-heading text-2xl font-bold">Reorder suggestions</h1>
        <p className="text-sm text-plum-ink/50">
          Suggested quantities from your last 30 days of usage — enough to cover ~2 weeks. Create a
          draft purchase order per supplier in one tap.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <p className="rounded-tile border border-plum-ink/10 bg-white p-6 text-sm text-plum-ink/50">
          Nothing to reorder right now. Suggestions appear as stock runs down against your usage.
        </p>
      ) : (
        [...groups.values()].map((g) => {
          const total = g.rows.reduce((s, r) => s + r.estCost, 0);
          return (
            <div key={g.supplierId ?? "none"} className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-plum-ink/10 p-4">
                <div className="min-w-0">
                  <h2 className="truncate font-heading font-bold">{g.supplierName}</h2>
                  <p className="text-xs text-plum-ink/45">Est. {formatPeso(total)} · {g.rows.length} items</p>
                </div>
                <form action={createPoFromSuggestions} className="shrink-0">
                  <input type="hidden" name="supplierId" value={g.supplierId ?? ""} />
                  <button className="rounded-full px-4 py-2 text-sm font-semibold btn-brand">Create draft PO</button>
                </form>
              </div>
              {/* Rows, not a table. The five columns this replaced had no
                  overflow wrapper at all, so on a phone the whole page
                  scrolled sideways and the suggested quantity — the only
                  number here that matters — sat off the edge. */}
              <ul className="divide-y divide-plum-ink/5">
                {g.rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-plum-ink">
                      {r.name}
                      {r.stockQty <= r.reorderLevel && (
                        <span className="ml-2 rounded-full bg-guava/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-guava">
                          low
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-heading text-sm font-extrabold text-brand-primary">
                      +{r.suggestedQty} {r.unit}
                    </span>
                    <span className="w-20 shrink-0 text-right text-sm tabular-nums text-plum-ink/60">
                      {formatPeso(r.estCost)}
                    </span>
                    <span className="w-full text-[11px] text-plum-ink/45">
                      {r.stockQty} {r.unit} in stock · using {r.avgDailyUse} {r.unit}/day
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
