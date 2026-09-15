import { notFound } from "next/navigation";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { getStatement, productName } from "@/server/partners/revenue";
import { peso } from "@/components/partner/Overview";

/**
 * The statement, laid out for paper.
 *
 * PRINT CSS AND THE BROWSER'S OWN "SAVE AS PDF", not a headless renderer. The
 * brief asked for "PDF via the existing Playwright pipeline in apps/servd";
 * there is no such pipeline — playwright, puppeteer, @react-pdf and jspdf are
 * none of them dependencies of any app here, and the only PDFs in the repo are
 * uploads to the menu scanner. Every other document in this codebase, including
 * every BIR receipt, prints this way.
 *
 * No portal chrome: a printed statement with a navigation bar and a "Log out"
 * button across the top is a document nobody would send to an accountant.
 */
export default async function StatementPrintPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const partner = await requirePartnerPageWith("revenue.read");
  const { month } = await params;
  const s = await getStatement(partner.id, month);
  if (!s) notFound();

  return (
    <main className="mx-auto max-w-3xl bg-white px-8 py-10 text-brand-ink print:px-0 print:py-0">
      <div className="flex items-start justify-between gap-6 border-b border-brand-ink/15 pb-5">
        <div>
          <p className="font-heading text-xl font-bold">Partner statement</p>
          <p className="mt-1 text-sm text-brand-ink/60">{s.month} · Asia/Manila</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{partner.name}</p>
          <p className="text-brand-ink/60">{partner.email}</p>
          <p className="mt-1 text-xs text-brand-ink/45">
            {s.frozenAt ? `Closed ${s.frozenAt.toLocaleDateString()}` : "Not yet closed"}
          </p>
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-brand-ink/15 text-left text-xs uppercase tracking-wide text-brand-ink/50">
            <th className="py-2 font-semibold">Settled</th>
            <th className="py-2 font-semibold">Product</th>
            <th className="py-2 font-semibold">Merchant</th>
            <th className="py-2 text-right font-semibold">Gross</th>
            <th className="py-2 text-right font-semibold">Share</th>
            <th className="py-2 text-right font-semibold">Yours</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-ink/10">
          {s.lines.map((l, i) => (
            <tr key={`${l.merchantId}-${i}`}>
              <td className="py-2 tabular-nums">{l.occurredAt.toLocaleDateString()}</td>
              <td className="py-2">{productName(l.productId)}</td>
              <td className="py-2 font-mono text-xs">{l.merchantId.slice(0, 8)}</td>
              <td className="py-2 text-right tabular-nums">{peso(l.grossCentavos)}</td>
              <td className="py-2 text-right tabular-nums">{l.sharePct}%</td>
              <td className="py-2 text-right tabular-nums">{peso(l.partnerCentavos)}</td>
            </tr>
          ))}
          {s.lines.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-brand-ink/50">
                Nothing settled in {s.month}.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-brand-ink/20 font-semibold">
            <td className="py-3" colSpan={3}>
              Total
            </td>
            <td className="py-3 text-right tabular-nums">{peso(s.grossCentavos)}</td>
            <td />
            <td className="py-3 text-right tabular-nums">{peso(s.partnerCentavos)}</td>
          </tr>
          <tr className="text-brand-ink/60">
            <td className="py-1" colSpan={5}>
              CANVEXIA&rsquo;s share
            </td>
            <td className="py-1 text-right tabular-nums">{peso(s.hqCentavos)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-8 text-xs leading-relaxed text-brand-ink/50">
        Computed from payments that settled in {s.month}. Each line carries the revenue
        share that applied when that payment settled, so this document does not change if
        the share is renegotiated later.
      </p>
      <p className="mt-6 text-xs text-brand-ink/35">Partner portal by CANVEXIA.</p>

      <div className="mt-8 print:hidden">
        <p className="text-sm text-brand-ink/55">
          Use your browser&rsquo;s print dialog and choose &ldquo;Save as PDF&rdquo;.
        </p>
      </div>
    </main>
  );
}
