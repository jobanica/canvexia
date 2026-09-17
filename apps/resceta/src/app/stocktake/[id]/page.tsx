import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { getStocktake } from "@/server/pharmacy/stocktake";
import { can } from "@/lib/pharmacy/roles";
import { manilaDateTime } from "@/lib/money";
import { CountSheet } from "./CountSheet";

export const dynamic = "force-dynamic";

export default async function StocktakeSheet({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const { id } = await params;
  const sheet = await getStocktake(staff.pharmacyId, id);
  if (!sheet) notFound();

  const closed = sheet.status === "approved" || sheet.status === "cancelled";

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/stocktake" className="text-sm text-slate-500 underline">
          ← Stocktake
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Count sheet
          <span className="ml-3 rounded bg-slate-100 px-2 py-1 align-middle text-sm font-medium">
            {sheet.status}
          </span>
        </h1>
        <p className="mt-1 mb-8 text-sm text-slate-500">
          Opened {manilaDateTime(sheet.createdAt)}
          {sheet.approvedAt && ` · approved ${manilaDateTime(sheet.approvedAt)}`}
          {sheet.notes && ` · ${sheet.notes}`}
        </p>

        <CountSheet
          stocktakeId={sheet.id}
          closed={closed}
          canApprove={can(staff.role, "viewReports")}
          lines={sheet.items.map((i) => ({
            id: i.id,
            name: i.product.name,
            genericName: i.product.genericName,
            unit: i.product.unit,
            systemQty: i.systemQty,
            countedQty: i.countedQty,
            unitCostCentavos: i.unitCostCentavos,
          }))}
        />
      </main>
    </AppShell>
  );
}
