import Link from "next/link";
import type { PartnerMerchant } from "@/server/partners/merchants";
import { isPaying } from "@/server/partners/merchants";
import { peso } from "./Overview";

/**
 * The merchant directory.
 *
 * A TABLE on desktop and CARDS on a phone, not a table with a horizontal
 * scrollbar. The brief is explicit that this screen is used standing in a
 * restaurant, and a six-column table on a 390px screen is a screen nobody reads.
 *
 * Filters are a plain GET form: no client state, the URL is shareable, and it
 * works before hydration. Search runs on the server over a list that is already
 * loaded, so there is no request per keystroke either way.
 */
function statusChip(m: PartnerMerchant) {
  if (m.subscriptionStatus === null) {
    // Not "₱0" and not "free": the pharmacy vertical has no billing yet, and a
    // zero here would look like a price somebody set.
    return { label: "Not billed yet", cls: "bg-brand-ink/[0.06] text-brand-ink/55" };
  }
  return {
    trialing: { label: "Trial", cls: "bg-brand-primary/12 text-brand-primary" },
    active: { label: "Paying", cls: "bg-brand-ink text-white" },
    past_due: { label: "Past due", cls: "bg-guava/12 text-guava" },
    cancelled: { label: "Cancelled", cls: "bg-brand-ink/[0.06] text-brand-ink/45" },
  }[m.subscriptionStatus];
}

export function MerchantTable({
  rows,
  query,
  product,
  status,
}: {
  rows: PartnerMerchant[];
  query: string;
  product: string;
  status: string;
}) {
  const field =
    "min-h-[42px] rounded-lg border border-brand-ink/15 bg-white px-3 text-sm outline-none focus:border-brand-ink";

  return (
    <>
      <form className="mt-5 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search name, slug or city"
          className={`${field} min-w-0 flex-1`}
        />
        <select name="product" defaultValue={product} className={field}>
          <option value="">All products</option>
          <option value="servd">Servd</option>
          <option value="pharmacy">Resceta</option>
        </select>
        <select name="status" defaultValue={status} className={field}>
          <option value="">Any status</option>
          <option value="paying">Paying</option>
          <option value="trialing">Trial</option>
          <option value="past_due">Past due</option>
        </select>
        <button className="rounded-full bg-brand-ink px-5 text-sm font-semibold text-white">
          Filter
        </button>
      </form>

      {rows.length === 0 && (
        <p className="mt-6 rounded-tile border border-brand-ink/10 bg-white p-6 text-sm text-brand-ink/55">
          No merchant matches that. Clear the filters to see all of them.
        </p>
      )}

      {/* Phone: one card per merchant. */}
      <ul className="mt-4 space-y-2 lg:hidden">
        {rows.map((m) => {
          const chip = statusChip(m);
          return (
            <li key={m.key}>
              <Link
                href={`/partner/merchants/${m.key}`}
                className="block rounded-tile border border-brand-ink/10 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="block text-xs text-brand-ink/50">
                      {m.productName}
                      {m.city ? ` · ${m.city}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${chip.cls}`}>
                    {chip.label}
                  </span>
                </div>
                <div className="mt-3 flex gap-5 text-xs tabular-nums text-brand-ink/55">
                  <span>{m.planName ?? "—"}</span>
                  <span>{m.priceMonthly === null ? "—" : `${peso(m.priceMonthly)}/mo`}</span>
                  <span>{m.ordersLast30d} orders / 30d</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop: the table. */}
      <div className="mt-4 hidden overflow-hidden rounded-tile border border-brand-ink/10 bg-white lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-ink/10 text-left text-xs uppercase tracking-wide text-brand-ink/45">
              <th className="px-4 py-3 font-semibold">Merchant</th>
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Orders 30d</th>
              <th className="px-4 py-3 text-right font-semibold">Opened</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-ink/[0.07]">
            {rows.map((m) => {
              const chip = statusChip(m);
              return (
                <tr key={m.key} className="hover:bg-brand-surface">
                  <td className="px-4 py-3">
                    <Link href={`/partner/merchants/${m.key}`} className="font-semibold hover:underline">
                      {m.name}
                    </Link>
                    {m.city && <div className="text-xs text-brand-ink/45">{m.city}</div>}
                  </td>
                  <td className="px-4 py-3 text-brand-ink/60">{m.productName}</td>
                  <td className="px-4 py-3 text-brand-ink/60">
                    {m.planName ?? "—"}
                    {m.priceMonthly !== null && (
                      <span className="block text-xs tabular-nums text-brand-ink/45">
                        {peso(m.priceMonthly)}/mo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${chip.cls}`}>
                      {chip.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{m.ordersLast30d}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-brand-ink/55">
                    {m.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-brand-ink/40">
        {rows.filter(isPaying).length} of these are paying today.
      </p>
    </>
  );
}
