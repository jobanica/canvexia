import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { parseRange, RANGE_PRESETS, presetRange } from "@/lib/pharmacy/range";
import { branchContext } from "@/server/pharmacy/branches";
import { discountLog } from "@/server/pharmacy/discount-log";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { LogTools } from "./DiscountLogTools";

export const dynamic = "force-dynamic";

/**
 * THE SENIOR CITIZEN AND PWD LOGBOOK.
 *
 * A pharmacy granting the statutory discount is expected to keep a separate
 * record of who received it, and to produce it when asked. Every field has been
 * on the sale since the discount existed; nothing but the receipt ever read
 * them back.
 *
 * GATED ON viewReports. This is a list of named people with their ID numbers —
 * the most personal data this system holds — and the people who answer for it
 * are the owner and the manager, not whoever is at the till.
 */
export default async function DiscountLogPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; kind?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Fdiscount-log");

  if (!can(staff.role, "viewReports")) {
    return (
      <AppShell staff={staff}>
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 text-sm text-slate-300">
            This account cannot see the discount logbook.
          </p>
        </main>
      </AppShell>
    );
  }

  const params = await searchParams;
  const range = parseRange(params);
  const kind = params.kind === "sc" || params.kind === "pwd" ? params.kind : null;
  const branch = await branchContext(staff.pharmacyId);

  const [log, shop] = await Promise.all([
    discountLog(staff.pharmacyId, range, branch),
    pharmacyDb(staff.pharmacyId, (tx) =>
      tx.pharmacy.findUnique({
        where: { id: staff.pharmacyId },
        select: { displayName: true, name: true, address: true, tin: true },
      }),
    ),
  ]);

  const rows = kind ? log.rows.filter((r) => r.kind === kind) : log.rows;
  const shopName = shop?.displayName ?? shop?.name ?? "";

  const csvRows = rows.map((r) => [
    manilaDate(r.at),
    r.receiptNumber,
    r.kind === "sc" ? "Senior Citizen" : "PWD",
    r.beneficiaryName ?? "",
    r.beneficiaryIdNo ?? "",
    r.items.map((i) => `${i.name} x${i.quantity}`).join("; "),
    (r.grossCentavos / 100).toFixed(2),
    (r.discountCentavos / 100).toFixed(2),
    (r.netCentavos / 100).toFixed(2),
    (r.vatExemptCentavos / 100).toFixed(2),
  ]);

  const href = (over: Record<string, string>) => {
    const q = new URLSearchParams({ from: range.from, to: range.to, ...(kind ? { kind } : {}) });
    for (const [k, v] of Object.entries(over)) v ? q.set(k, v) : q.delete(k);
    return `/discount-log?${q.toString()}`;
  };

  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + pick(r), 0);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Only the print view carries a letterhead — on screen the shell has it. */}
        <div className="hidden print:mb-4 print:block print:text-black">
          <h1 className="text-lg font-bold">{shopName}</h1>
          {shop?.address && <p className="text-xs">{shop.address}</p>}
          {shop?.tin && <p className="text-xs">TIN {shop.tin}</p>}
          <p className="mt-2 text-sm font-semibold">
            Senior Citizen and PWD discount record
          </p>
          <p className="text-xs">
            {manilaDate(new Date(`${range.from}T00:00:00+08:00`))} to{" "}
            {manilaDate(new Date(`${range.to}T00:00:00+08:00`))}
          </p>
        </div>

        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Senior Citizen &amp; PWD logbook
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Every sale that carried the statutory discount, with the ID it was
              granted against.
            </p>
          </div>
          <LogTools
            filename={`sc-pwd-logbook-${range.from}-to-${range.to}.csv`}
            header={[
              "Date",
              "Receipt no.",
              "Type",
              "Name",
              "ID number",
              "Items",
              "Gross",
              "Discount",
              "Net paid",
              "VAT exempt",
            ]}
            rows={csvRows}
          />
        </div>

        {/* ── RANGE AND TYPE ─────────────────────────────────────────────── */}
        <form
          data-print-hide
          className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:hidden"
        >
          <label className="text-xs text-slate-400">
            From
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              className="mt-1 block rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-slate-400">
            To
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              className="mt-1 block rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white"
            />
          </label>
          {kind && <input type="hidden" name="kind" value={kind} />}
          <button className="rounded-xl brand-gradient px-4 py-2 text-sm font-semibold text-white">
            Show
          </button>
          <div className="flex items-center gap-1">
            {RANGE_PRESETS.map((p) => {
              const r = presetRange(p.days);
              return (
                <Link
                  key={p.label}
                  href={`/discount-log?from=${r.from}&to=${r.to}${kind ? `&kind=${kind}` : ""}`}
                  className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {[
              { v: "", label: `All (${log.totals.sales})` },
              { v: "sc", label: `Senior Citizen (${log.totals.sc})` },
              { v: "pwd", label: `PWD (${log.totals.pwd})` },
            ].map((o) => (
              <Link
                key={o.v || "all"}
                href={href({ kind: o.v })}
                className={`rounded-lg px-2.5 py-1.5 text-xs ${
                  (kind ?? "") === o.v
                    ? "bg-white/15 font-semibold text-white"
                    : "text-slate-300 hover:bg-white/10"
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </form>

        {log.missingId > 0 && (
          /*
            A discount granted with no ID recorded cannot be defended if anybody
            asks about it. The counter refuses such a sale now, so this is
            history — surfaced rather than left for somebody to find a row at a
            time.
          */
          <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 print:hidden">
            <strong>{log.missingId}</strong>{" "}
            {log.missingId === 1 ? "sale has" : "sales have"} a discount recorded with no ID
            number. The counter refuses that now, so these pre-date the check.
          </p>
        )}

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-300">
            No discounted sales in this range.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] print:border-0 print:bg-white print:text-black">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-400 print:bg-transparent print:text-black">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Receipt</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">ID number</th>
                  <th className="px-3 py-2.5 font-medium">Items</th>
                  <th className="px-3 py-2.5 text-right font-medium">Gross</th>
                  <th className="px-3 py-2.5 text-right font-medium">Discount</th>
                  <th className="px-3 py-2.5 text-right font-medium">Net paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 print:divide-black/20">
                {rows.map((r) => (
                  <tr key={r.saleId}>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                      {manilaDate(r.at)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      <Link href={`/receipts/${r.saleId}`} className="underline print:no-underline">
                        {r.receiptNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.kind === "sc" ? "Senior Citizen" : "PWD"}
                    </td>
                    <td className="px-3 py-2.5">{r.beneficiaryName ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {r.beneficiaryIdNo ? (
                        r.beneficiaryIdNo
                      ) : (
                        <span className="text-amber-300 print:text-black">not recorded</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-300 print:text-black">
                      {r.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {peso(r.grossCentavos)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300 print:text-black">
                      −{peso(r.discountCentavos)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{peso(r.netCentavos)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-white/15 bg-white/[0.04] print:bg-transparent">
                <tr className="font-semibold">
                  <td className="px-3 py-2.5" colSpan={6}>
                    {rows.length} sale{rows.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {peso(sum((r) => r.grossCentavos))}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    −{peso(sum((r) => r.discountCentavos))}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {peso(sum((r) => r.netCentavos))}
                  </td>
                </tr>
                <tr className="text-xs text-slate-400 print:text-black">
                  <td className="px-3 pb-3" colSpan={9}>
                    VAT exempted across these sales: {peso(sum((r) => r.vatExemptCentavos))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}
