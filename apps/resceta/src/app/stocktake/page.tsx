import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listStocktakes } from "@/server/pharmacy/stocktake";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { StartCount } from "./StartCount";

export const dynamic = "force-dynamic";

/**
 * Counts, past and in progress.
 *
 * The variance column is the reason the document is kept after the numbers have
 * been corrected: one product short every single month is a pattern, and a
 * system that only stores the corrected figure can never show it.
 */
export default async function StocktakePage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const rows = await listStocktakes(staff.pharmacyId);
  const open = rows.find((r) => r.status === "counting" || r.status === "draft");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Stocktake</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Count the shelf, then approve. Nothing moves until it is approved, and
          the difference is kept afterwards.
        </p>

        {open ? (
          <p className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            A count is in progress —{" "}
            <Link href={`/stocktake/${open.id}`} className="font-semibold underline">
              {open.counted} of {open.lines} lines counted
            </Link>
            . Finish or cancel it before starting another.
          </p>
        ) : (
          can(staff.role, "manageStock") && (
            <div className="mb-8">
              <StartCount />
            </div>
          )
        )}

        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            No counts yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
              <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Opened</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2 text-right font-medium">Counted</th>
                  <th className="px-4 py-2 text-right font-medium">Variance</th>
                  <th className="px-4 py-2 text-right font-medium">At cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2">
                      <Link href={`/stocktake/${s.id}`} className="underline">
                        {manilaDate(s.createdAt)}
                      </Link>
                      {s.notes && <p className="text-xs text-slate-500">{s.notes}</p>}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-white/10 px-2 py-0.5 text-xs">{s.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.counted} / {s.lines}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        s.varianceUnits < 0 ? "text-red-300" : s.varianceUnits > 0 ? "text-amber-300" : ""
                      }`}
                    >
                      {s.varianceUnits > 0 ? "+" : ""}
                      {s.varianceUnits}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {peso(s.varianceCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}
