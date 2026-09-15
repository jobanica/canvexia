import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHqPage } from "@/server/hq/auth";
import { getStatement } from "@/server/hq/billing";
import { HqShell } from "@/components/hq/HqShell";
import { peso } from "@/components/canvexia/Cards";
import { MarkPaid } from "@/components/hq/BillingForms";

export default async function HqStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireHqPage("billing.run");
  const { id } = await params;
  const s = await getStatement(id);
  if (!s) notFound();

  // The frozen totals and a fresh computation from the ledger. If they differ,
  // somebody backdated a row — which is worth seeing rather than hiding behind
  // whichever number the screen happened to read.
  const drifted =
    s.grossCentavos !== s.statement.grossCentavos ||
    s.partnerCentavos !== s.statement.partnerCentavos;

  return (
    <HqShell
      user={user}
      title={`${s.partnerName} · ${s.month}`}
      subtitle={`Frozen ${s.frozenAt.toLocaleDateString("en-PH", { dateStyle: "medium" })} · ${s.direction === "payout" ? "HQ pays out" : "HQ invoices"}`}
      actions={
        <Link href="/hq/billing?tab=statements" className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface">
          All statements
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Gross", value: s.grossCentavos },
          { label: "Partner", value: s.partnerCentavos },
          { label: "CANVEXIA", value: s.hqCentavos },
        ].map((c) => (
          <div key={c.label} className="rounded-tile border border-brand-ink/10 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-brand-ink/45">{c.label}</p>
            <p className="mt-1 font-heading text-2xl font-bold tabular-nums">{peso(c.value)}</p>
          </div>
        ))}
      </div>

      {drifted && (
        <p className="mt-4 rounded-tile border border-guava/30 bg-guava/[0.04] px-4 py-3 text-sm text-guava">
          The frozen totals no longer match the ledger — it now computes to {peso(s.statement.grossCentavos)} gross.
          A row was added or backdated into this month after it was closed.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-tile border border-brand-ink/10 bg-white p-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {s.payoutStatus === "paid"
              ? `${s.direction === "payout" ? "Sent" : "Paid"}${s.paidAt ? ` on ${s.paidAt.toLocaleDateString("en-PH", { dateStyle: "medium" })}` : ""}`
              : s.overdueDays !== null
                ? `${s.overdueDays} days overdue`
                : s.direction === "payout"
                  ? "Payout due"
                  : "Invoice due"}
          </p>
          {s.note && <p className="mt-0.5 text-xs text-brand-ink/50">Reference: {s.note}</p>}
        </div>
        <span className="ml-auto">
          <MarkPaid id={s.id} direction={s.direction} paid={s.payoutStatus === "paid"} />
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        <h2 className="border-b border-brand-ink/10 px-5 py-4 font-heading text-lg font-bold">
          {s.statement.lines.length} line{s.statement.lines.length === 1 ? "" : "s"}
        </h2>
        {s.statement.lines.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
            Nothing settled this month.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                <tr>
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-3 py-3 font-semibold">Merchant</th>
                  <th className="px-3 py-3 font-semibold">Kind</th>
                  <th className="px-3 py-3 text-right font-semibold">Gross</th>
                  <th className="px-3 py-3 text-right font-semibold">Rate</th>
                  <th className="px-5 py-3 text-right font-semibold">Partner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-ink/[0.06]">
                {s.statement.lines.map((l, i) => (
                  <tr key={`${l.merchantId}-${i}`}>
                    <td className="px-5 py-3 text-xs tabular-nums">
                      {l.occurredAt.toLocaleDateString("en-PH", { dateStyle: "medium" })}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{l.productId}:{l.merchantId}</td>
                    <td className="px-3 py-3">{l.kind}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{peso(l.grossCentavos)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{l.sharePct}%</td>
                    <td className="px-5 py-3 text-right tabular-nums">{peso(l.partnerCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
          Each line carries the rate that applied when it settled — {s.partnerSharePct}% is
          today&rsquo;s. Renegotiating cannot rewrite a statement already issued.
        </p>
      </div>
    </HqShell>
  );
}
