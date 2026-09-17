import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { getTransfer } from "@/server/pharmacy/transfers";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDateTime, manilaExpiry } from "@/lib/money";
import { TransferControls } from "./TransferControls";

export const dynamic = "force-dynamic";

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const { id } = await params;
  const transfer = await getTransfer(staff.pharmacyId, id);
  if (!transfer) notFound();

  const units = transfer.items.reduce((t, i) => t + i.quantity, 0);
  const value = transfer.items.reduce((t, i) => t + i.quantity * i.unitCostCentavos, 0);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/transfers" className="text-sm text-slate-500 underline">
          ← Transfers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {transfer.fromBranch.name} → {transfer.toBranch.name}
        </h1>
        <p className="mt-1 mb-8 text-sm text-slate-500">
          Sent {manilaDateTime(transfer.createdAt)}
          {transfer.receivedAt && ` · received ${manilaDateTime(transfer.receivedAt)}`} ·{" "}
          {units} units · {peso(value)} at cost
          {transfer.notes && ` · ${transfer.notes}`}
        </p>

        {can(staff.role, "manageStock") && (
          <div className="mb-8">
            <TransferControls transferId={transfer.id} status={transfer.status} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Lot</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">At cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfer.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2">
                    {i.product.name}
                    {i.product.genericName && (
                      <span className="ml-2 text-xs text-slate-500">{i.product.genericName}</span>
                    )}
                  </td>
                  {/*
                    Carried on the line, not looked up from the source batch:
                    the batch may be emptied and tidied away, and the goods in
                    the van still have a lot number.
                  */}
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">
                    {i.lotNumber ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {i.expiryDate ? manilaExpiry(i.expiryDate) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.quantity} {i.product.unit}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {peso(i.quantity * i.unitCostCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}
