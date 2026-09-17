import { redirect } from "next/navigation";
import { getCurrentStaff, requireStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listBranches } from "@/server/pharmacy/branches";
import { BranchList } from "./BranchList";

export const dynamic = "force-dynamic";

/**
 * Branches.
 *
 * A pharmacy that opens a second shop keeps one catalogue, one staff list, one
 * receipt series and one set of customers — and needs two sets of STOCK. That
 * is the whole of what a branch is here: a place stock sits, a till it is sold
 * from, and a column on the rows that record both.
 */
export default async function BranchesPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  await requireStaff("manageSettings");

  const rows = await listBranches(staff.pharmacyId);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Branches</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          One catalogue, one staff list, one receipt series — separate stock.
          Switch between them in the header; move stock between them under
          Transfers.
        </p>
        <BranchList rows={rows} />
      </main>
    </AppShell>
  );
}
