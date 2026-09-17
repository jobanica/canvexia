import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listTransfers } from "@/server/pharmacy/transfers";
import { branchContext } from "@/server/pharmacy/branches";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  in_transit: "bg-amber-500/15 text-amber-200",
  received: "bg-emerald-500/15 text-emerald-300",
  cancelled: "bg-white/10 text-slate-300",
};

/**
 * Stock moving between branches.
 *
 * IN TRANSIT IS A REAL STATE. The boxes are in a van: they have left one shelf
 * and are not yet on the other. A one-step transfer would make stock teleport
 * and hide a shortfall at either end until a stocktake found it months later.
 */
export default async function TransfersPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const [rows, branch] = await Promise.all([
    listTransfers(staff.pharmacyId),
    branchContext(staff.pharmacyId),
  ]);

  const inTransit = rows.filter((t) => t.status === "in_transit");
  const canMove = can(staff.role, "manageStock");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Transfers</h1>
            <p className="mt-1 text-sm text-slate-500">
              {inTransit.length > 0
                ? `${inTransit.length} still in transit.`
                : "Nothing in transit."}
            </p>
          </div>
          {canMove && branch.branches.length > 1 && (
            <Link
              href="/transfers/new"
              className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white"
            >
              Send stock
            </Link>
          )}
        </div>

        {branch.branches.length < 2 && (
          <p className="mb-6 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            There is only one branch, so there is nowhere to transfer to.{" "}
            <Link href="/branches" className="font-medium underline">
              Open another
            </Link>{" "}
            first.
          </p>
        )}

        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            No transfers yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
              <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Sent</th>
                  <th className="px-4 py-2 font-medium">From → to</th>
                  <th className="px-4 py-2 text-right font-medium">Units</th>
                  <th className="px-4 py-2 text-right font-medium">At cost</th>
                  <th className="px-4 py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2">
                      <Link href={`/transfers/${t.id}`} className="underline">
                        {manilaDate(t.createdAt)}
                      </Link>
                      {t.notes && <p className="text-xs text-slate-500">{t.notes}</p>}
                    </td>
                    <td className="px-4 py-2 text-slate-300">
                      {t.fromBranchName} → {t.toBranchName}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.units}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{peso(t.valueCentavos)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${TONE[t.status] ?? TONE.cancelled}`}
                      >
                        {t.status.replace("_", " ")}
                      </span>
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
