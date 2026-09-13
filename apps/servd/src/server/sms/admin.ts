"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { adjustCredits } from "@/server/sms/credits";

/** Platform super-admin sells SMS credits to a restaurant (records a ledger entry). */
export async function addSmsCredits(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const amount = z.coerce.number().int().min(1).max(1_000_000).parse(formData.get("amount"));
  await adjustCredits(restaurantId, amount, "platform_topup");
  revalidatePath("/super-admin");
}

/** Platform super-admin assigns a restaurant's registered sender name. */
export async function setSenderName(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const senderName = String(formData.get("senderName") ?? "").trim().slice(0, 11) || null;
  await systemDb((tx) =>
    tx.restaurant.update({ where: { id: restaurantId }, data: { smsSenderName: senderName }, select: { id: true } }),
  );
  revalidatePath("/super-admin");
}
