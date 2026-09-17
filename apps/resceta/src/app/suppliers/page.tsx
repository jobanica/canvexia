import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listSuppliers } from "@/server/pharmacy/suppliers";
import { can } from "@/lib/pharmacy/roles";
import { SupplierBook } from "./SupplierBook";

export const dynamic = "force-dynamic";

/**
 * Who this pharmacy buys from.
 *
 * REPORTED, in effect — the supplier table has carried a phone number, an email
 * address, a contact person and delivery notes since it was written, and not
 * one of them could be entered anywhere. A supplier could only be created as a
 * name typed into the receiving form, and never edited afterwards.
 *
 * So when the batch expiring next week needed re-ordering, the pharmacy had the
 * distributor's name on screen and had to find the number somewhere else.
 */
export default async function SuppliersPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const rows = await listSuppliers(staff.pharmacyId);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="mt-1 mb-8 text-sm text-slate-500">
          Who you buy from, and what of theirs is still on the shelf. These are
          offered by name when you receive a delivery.
        </p>
        <SupplierBook rows={rows} canEdit={can(staff.role, "manageStock")} />
      </main>
    </AppShell>
  );
}
