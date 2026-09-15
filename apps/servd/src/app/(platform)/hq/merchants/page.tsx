import Link from "next/link";
import { requireHqPage } from "@/server/hq/auth";
import { listAllMerchants } from "@/server/hq/merchants";
import { PRODUCTS } from "@servd/core";
import { HqShell } from "@/components/hq/HqShell";
import { peso } from "@/components/canvexia/Cards";

export default async function HqMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string; product?: string; status?: string; q?: string }>;
}) {
  const user = await requireHqPage("partners.read");
  const sp = await searchParams;
  const { rows, partners, unassigned } = await listAllMerchants({
    partnerId: sp.partner,
    productId: sp.product,
    status: sp.status,
    q: sp.q,
  });

  const params = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <HqShell
      user={user}
      title="Merchants"
      subtitle={`${rows.length} across every partner and product.`}
      actions={
        <a
          href={`/hq/merchants/export${params ? `?${params}` : ""}`}
          className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface"
        >
          Export CSV
        </a>
      }
    >
      {unassigned > 0 && (
        // Not cosmetic: a merchant with a null partnerId is invisible to every
        // portal and absent from every statement — somebody nobody is paid for.
        <p className="mb-4 rounded-tile border border-guava/30 bg-guava/[0.04] px-4 py-3 text-sm text-guava">
          <Link href="/hq/merchants?partner=__unassigned__" className="font-semibold underline">
            {unassigned} merchant{unassigned === 1 ? " belongs" : "s belong"} to nobody
          </Link>{" "}
          — invisible to every portal, and on nobody&rsquo;s statement.
        </p>
      )}

      <form className="flex flex-wrap items-end gap-2 rounded-tile border border-brand-ink/10 bg-white p-4">
        <label className="min-w-0 flex-1 text-xs font-semibold text-brand-ink/70">
          Search
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Name, slug, city or partner"
            className="mt-1 block min-h-[38px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-brand-ink/70">
          Partner
          <select name="partner" defaultValue={sp.partner ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm">
            <option value="">Any</option>
            <option value="__unassigned__">— unassigned —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.isHouse ? " (house)" : ""}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-brand-ink/70">
          Product
          <select name="product" defaultValue={sp.product ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm">
            <option value="">Any</option>
            {Object.values(PRODUCTS).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <button className="min-h-[38px] rounded-full bg-brand-ink px-4 text-sm font-semibold text-white">Filter</button>
      </form>

      <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-brand-ink/50">No merchant matches that.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                <tr>
                  <th className="px-5 py-3 font-semibold">Merchant</th>
                  <th className="px-3 py-3 font-semibold">Product</th>
                  <th className="px-3 py-3 font-semibold">Partner</th>
                  <th className="px-3 py-3 font-semibold">Plan</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">City</th>
                  <th className="px-3 py-3 text-right font-semibold">Orders 30d</th>
                  <th className="px-5 py-3 font-semibold">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-ink/[0.06]">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-brand-surface/60">
                    <td className="px-5 py-3">
                      <Link href={`/hq/merchants/${encodeURIComponent(r.key)}`} className="font-semibold">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-brand-ink/45">
                        {r.slug}
                        {!r.live && " · no login yet"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-brand-ink/60">{r.productName}</td>
                    <td className="px-3 py-3">
                      {r.partnerId ? (
                        <Link href={`/hq/partners/${r.partnerId}`} className="text-brand-primary">
                          {r.partnerName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-guava">unassigned</span>
                      )}
                      {r.isHouse && (
                        <span className="ml-1.5 rounded-full bg-brand-accent/15 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-brand-accent">
                          national
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-brand-ink/60">
                      {r.planName ?? <span className="text-brand-ink/30">not billed yet</span>}
                      {r.priceMonthly !== null && (
                        <span className="block text-xs tabular-nums text-brand-ink/40">{peso(r.priceMonthly)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-brand-ink/60">
                      {r.subscriptionStatus ?? r.status}
                    </td>
                    <td className="px-3 py-3 text-brand-ink/60">{r.city ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.ordersLast30d}</td>
                    <td className="px-5 py-3 text-xs text-brand-ink/50">
                      {r.lastActivityAt
                        ? r.lastActivityAt.toLocaleDateString("en-PH", { dateStyle: "medium" })
                        : "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
          Both axes on one list. Resceta pharmacies read &ldquo;not billed yet&rdquo; rather than
          ₱0 — that vertical has no billing, and a zero would look like a price.
        </p>
      </div>
    </HqShell>
  );
}
