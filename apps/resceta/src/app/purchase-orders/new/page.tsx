import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff, requireStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { poProducts } from "@/server/pharmacy/purchase-order-options";
import { branchContext } from "@/server/pharmacy/branches";
import { listSuppliers } from "@/server/pharmacy/suppliers";
import { NewPoForm } from "./NewPoForm";

export const dynamic = "force-dynamic";

export default async function NewPoPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill?: string }>;
}) {
  const { prefill } = await searchParams;
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  // The page gate as well as the action gate. Two layers, and the action's is
  // the one that matters — this one is so the link is never a dead end.
  await requireStaff("manageStock");

  const branch = await branchContext(staff.pharmacyId);

  const [products, suppliers] = await Promise.all([
    poProducts(staff.pharmacyId, branch),
    listSuppliers(staff.pharmacyId),
  ]);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/purchase-orders" className="text-sm text-slate-400 hover:underline">
          ← Back to purchase orders
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New purchase order</h1>
        <p className="mt-1 mb-8 text-sm text-slate-300">
          Draft an order to send to a supplier. Nothing moves on the shelf until
          you receive against it.
        </p>
        <NewPoForm
          products={products}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          prefillLow={prefill === "low"}
        />
      </main>
    </AppShell>
  );
}
