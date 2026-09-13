"use server";

import { revalidatePath } from "next/cache";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { pesosToCentavos } from "@/lib/money";

export async function addExpense(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const date = String(formData.get("date") ?? "");
  const category = String(formData.get("category") ?? "").trim() || "Other";
  const amount = pesosToCentavos(Number(formData.get("amount") ?? 0));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!date || amount <= 0) return;
  await tenantDb(restaurantId, (tx) =>
    tx.expense.create({
      data: { restaurantId, date: new Date(`${date}T00:00:00`), category, amount, note },
    }),
  );
  revalidatePath("/admin/accounting/expenses");
}

export async function deleteExpense(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id") ?? "");
  await tenantDb(restaurantId, (tx) => tx.expense.deleteMany({ where: { id, restaurantId } }));
  revalidatePath("/admin/accounting/expenses");
}
