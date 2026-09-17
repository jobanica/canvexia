import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff, requireStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { branchContext } from "@/server/pharmacy/branches";
import { transferableBatches } from "@/server/pharmacy/transfers";
import { peso, manilaExpiry } from "@/lib/money";
import { TransferForm } from "./TransferForm";

export const dynamic = "force-dynamic";

export default async function NewTransferPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  await requireStaff("manageStock");

  const branch = await branchContext(staff.pharmacyId);
  const from = branch.current ?? branch.branches.find((b) => b.isMain) ?? branch.branches[0];
  if (!from) redirect("/branches");

  const batches = await transferableBatches(staff.pharmacyId, from.id, from.isMain);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/transfers" className="text-sm text-slate-500 underline">
          ← Transfers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Send stock</h1>
        <p className="mt-1 mb-8 text-sm text-slate-500">
          {/*
            Named explicitly. "All branches" is a reading position — stock has
            to leave somewhere real, and a transfer whose source the person
            guessed wrong is two wrong shelves.
          */}
          From <span className="font-semibold text-white">{from.name}</span>. Switch
          branches in the header to send from somewhere else.
        </p>
        <TransferForm
          branches={branch.branches.map((b) => ({ id: b.id, name: b.name }))}
          fromBranchId={from.id}
          batches={batches.map((b) => ({
            id: b.id,
            quantity: b.quantity,
            label: [
              b.product.name,
              b.lotNumber ? `lot ${b.lotNumber}` : null,
              b.expiryDate ? `exp ${manilaExpiry(b.expiryDate)}` : "no expiry",
              `${peso(b.costCentavos)} each`,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
      </main>
    </AppShell>
  );
}
