"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { uploadMenuImage } from "@/server/storage/menu-images";
import { getStorefront, getPublicStorefront } from "@/server/storefront/storefront";

/**
 * Dine-in GCash QR — a manual, gateway-free way to settle a table's bill.
 *
 * The diner taps "Pay with GCash QR" on the table-QR bill; staff are alerted and
 * a waiter brings the printed QR standee to the table. If the store uploaded its
 * QR image we also show it on the diner's phone so they can scan straight away.
 * The money lands in the store's own GCash account — Servd never touches it, and
 * the cashier still confirms the payment (method: GCash) to close the order.
 */
export interface DineInGcash {
  enabled: boolean;
  name: string; // GCash account name
  number: string; // GCash mobile number
  qrUrl: string; // uploaded QR image (may be empty — waiter brings the printout)
}

const OFF: DineInGcash = { enabled: false, name: "", number: "", qrUrl: "" };

/**
 * Public (no session): the GCash details to show a diner at the table. Only the
 * customer-facing account name / number / QR are ever returned, and only when
 * the store switched the option on.
 */
export async function getDineInGcash(input: { slug: string }): Promise<DineInGcash> {
  const slug = String(input?.slug ?? "").trim();
  if (!slug) return OFF;
  try {
    const restaurant = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { slug, status: "active" }, select: { id: true } }),
    );
    if (!restaurant) return OFF;
    const { payment } = await getPublicStorefront(restaurant.id);
    if (!payment.dineInGcashEnabled) return OFF;
    return {
      enabled: true,
      name: payment.gcashName,
      number: payment.gcashNumber,
      qrUrl: payment.gcashQrUrl,
    };
  } catch {
    return OFF;
  }
}

export type DineInGcashState = { ok?: boolean; error?: string } | null;

/**
 * Admin: turn the table-QR GCash option on/off and keep the account details.
 * The name / number / QR are the SAME fields the online website uses, so a store
 * that already set up manual GCash there doesn't have to enter them twice.
 */
export async function updateDineInGcash(
  _prev: DineInGcashState,
  formData: FormData,
): Promise<DineInGcashState> {
  const { restaurantId } = await requireAdminAction();

  const enabled = formData.get("dineInGcashEnabled") === "on";
  const str = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);

  // A freshly uploaded QR replaces the saved one; otherwise keep what's there.
  let qrUrl = String(formData.get("gcashQrUrl") ?? "").trim();
  const file = formData.get("gcashQr");
  if (file instanceof File && file.size > 0) {
    try {
      qrUrl = await uploadMenuImage(restaurantId, file);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Couldn't upload the GCash QR image." };
    }
  }

  // Merge into the saved config so the website's payment settings are untouched.
  const { payment } = await getStorefront(restaurantId);
  const paymentConfig = {
    ...payment,
    dineInGcashEnabled: enabled,
    gcashName: str("gcashName", 120),
    gcashNumber: str("gcashNumber", 40),
    gcashQrUrl: qrUrl.slice(0, 500),
  } as unknown as Prisma.InputJsonValue;

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.storefrontSetting.upsert({
        where: { restaurantId },
        create: { restaurantId, paymentConfig },
        update: { paymentConfig },
        select: { id: true },
      }),
    );
  } catch {
    return { error: "Couldn't save. Your database may need a quick update — try again after the migration." };
  }

  revalidatePath("/admin/tables");
  revalidatePath("/order/[slug]/[tableToken]", "page");
  return { ok: true };
}
