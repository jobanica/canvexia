import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { getStatement, productName } from "@/server/partners/revenue";
import { PortalShell } from "@/components/partner/PortalShell";
import { peso } from "@/components/partner/Overview";

export default async function StatementPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const partner = await requirePartnerPageWith("revenue.read");
  const { month } = await params;
  const s = await getStatement(partner.id, month);
  if (!s) notFound();

  return (
    <PortalShell
      partner={partner}
      title={`Statement · ${s.month}`}
    >
        <Link href="/partner/revenue" className="text-sm text-brand-ink/50 hover:text-brand-ink">
          ← Revenue
        </Link>

        <div className="mt-4 flex flex-wrap items-baseline justify-end gap-3">
          <div className="flex gap-2">
            <a
              href={`/partner/revenue/${s.month}/print`}
              className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface"
            >
              Print / PDF
            </a>
            <a
              href={`/api/partner/statement/${s.month}.csv`}
              className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface"
            >
              CSV
            </a>
          </div>
        </div>

        <dl className="mt-6 grid gap-px overflow-hidden rounded-tile bg-brand-ink/10 sm:grid-cols-3">
          {[
            ["Settled", s.grossCentavos],
            ["Yours", s.partnerCentavos],
            ["CANVEXIA's", s.hqCentavos],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-white p-4">
              <dt className="text-xs text-brand-ink/50">{label}</dt>
              <dd className="mt-1 font-heading text-xl font-bold tabular-nums">
                {peso(Number(value))}
              </dd>
            </div>
          ))}
        </dl>

        {s.lines.length === 0 ? (
          <p className="mt-6 rounded-tile border border-dashed border-brand-ink/15 bg-white p-8 text-center text-sm text-brand-ink/55">
            Nothing settled in {s.month}.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-tile border border-brand-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-ink/10 text-left text-xs uppercase tracking-wide text-brand-ink/45">
                  <th className="px-4 py-3 font-semibold">Settled</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Merchant</th>
                  <th className="px-4 py-3 font-semibold">Kind</th>
                  <th className="px-4 py-3 text-right font-semibold">Gross</th>
                  <th className="px-4 py-3 text-right font-semibold">Share</th>
                  <th className="px-4 py-3 text-right font-semibold">Yours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-ink/[0.07]">
                {s.lines.map((l, i) => (
                  <tr key={`${l.merchantId}-${i}`}>
                    <td className="px-4 py-3 tabular-nums text-brand-ink/60">
                      {l.occurredAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-brand-ink/60">{productName(l.productId)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{l.merchantId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-brand-ink/60">{l.kind}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{peso(l.grossCentavos)}</td>
                    {/*
                      The rate that applied WHEN IT SETTLED, not today's. It is a
                      column rather than a calculation for exactly this reason:
                      renegotiating a share must not rewrite statements already
                      issued.
                    */}
                    <td className="px-4 py-3 text-right tabular-nums text-brand-ink/55">
                      {l.sharePct}%
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {peso(l.partnerCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-brand-ink/45">
          {s.frozenAt
            ? `Closed ${s.frozenAt.toLocaleDateString()}. Payout status: ${s.payoutStatus ?? "pending"}.`
            : "Still open — this month closes on the 1st, Manila time."}
        </p>
    </PortalShell>
  );
}
