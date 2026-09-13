"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { requireStaff } from "@/server/tenancy/current-user";
import { pesosToCentavos } from "@/lib/money";
import { writeAudit } from "@/server/audit/log";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { getCashierTables, type CashierTable } from "@/server/orders/cashier";

/**
 * Gift cards / store credit. Server-authoritative: balances only change inside a
 * transaction, every move is written to the ledger, and the amount redeemed is
 * recomputed from the order's real net (the client never sets money).
 */

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars
function generateCode(): string {
  const bytes = randomBytes(8);
  let out = "GC-";
  for (let i = 0; i < 8; i++) out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return out;
}
function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export interface GiftCardRow {
  id: string;
  code: string;
  initialBalance: number;
  balance: number;
  customerName: string | null;
  customerPhone: string | null;
  active: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

export async function listGiftCards(restaurantId: string): Promise<GiftCardRow[]> {
  try {
    return await tenantDb(restaurantId, (tx) =>
      tx.giftCard.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          initialBalance: true,
          balance: true,
          customerName: true,
          customerPhone: true,
          active: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    );
  } catch {
    return []; // not migrated yet
  }
}

export type FormState = { ok?: boolean; error?: string; code?: string } | null;

const issueSchema = z.object({
  amountPesos: z.coerce.number().positive("Enter an amount.").max(1_000_000),
  code: z.string().trim().max(24).optional().or(z.literal("")),
  customerName: z.string().trim().max(80).optional().or(z.literal("")),
  customerPhone: z.string().trim().max(30).optional().or(z.literal("")),
  expiresAt: z.string().trim().optional().or(z.literal("")),
});

export async function issueGiftCard(_prev: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const parsed = issueSchema.safeParse({
    amountPesos: formData.get("amountPesos"),
    code: formData.get("code") ?? "",
    customerName: formData.get("customerName") ?? "",
    customerPhone: formData.get("customerPhone") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  const amount = pesosToCentavos(v.amountPesos);
  const code = v.code ? normalize(v.code) : generateCode();
  const expiresAt = v.expiresAt ? new Date(v.expiresAt) : null;

  try {
    await tenantDb(restaurantId, async (tx) => {
      const dupe = await tx.giftCard.findFirst({ where: { code }, select: { id: true } });
      if (dupe) throw new Error("DUPLICATE");
      const card = await tx.giftCard.create({
        data: {
          restaurantId,
          code,
          initialBalance: amount,
          balance: amount,
          customerName: v.customerName || null,
          customerPhone: v.customerPhone || null,
          expiresAt,
        },
        select: { id: true },
      });
      await tx.giftCardTxn.create({
        data: { restaurantId, giftCardId: card.id, amount, kind: "issue" },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "DUPLICATE") {
      return { error: "That code is already in use. Pick another." };
    }
    return { error: "Couldn't issue the card. Make sure the gift-card migration has been run." };
  }
  revalidatePath("/admin/gift-cards");
  return { ok: true, code };
}

export async function setGiftCardActive(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await tenantDb(restaurantId, (tx) =>
    tx.giftCard.updateMany({ where: { id }, data: { active: !active } }),
  );
  revalidatePath("/admin/gift-cards");
}

export type ApplyResult =
  | { ok: true; applied: number; tables: CashierTable[] }
  | { ok: false; error: string };

/** Redeem a gift card against an open, unpaid order (cashier-authorised). */
export async function applyGiftCard(orderId: string, code: string): Promise<ApplyResult> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const normalized = normalize(code);
  if (!normalized) return { ok: false, error: "Enter a gift card code." };

  let applied = 0;
  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        select: { id: true, total: true, discountAmount: true, creditApplied: true, giftCardId: true },
      });
      if (!order) throw new Error("Only an unpaid order can use a gift card.");
      if (order.giftCardId) throw new Error("A gift card is already applied. Remove it first.");

      const card = await tx.giftCard.findFirst({ where: { code: normalized, active: true } });
      if (!card) throw new Error("That gift card code isn't valid.");
      if (card.expiresAt && card.expiresAt.getTime() < Date.now()) throw new Error("That gift card has expired.");
      if (card.balance <= 0) throw new Error("That gift card has no balance left.");

      const netRemaining = Math.max(0, order.total - order.discountAmount - order.creditApplied);
      if (netRemaining <= 0) throw new Error("This order is already fully covered.");

      applied = Math.min(card.balance, netRemaining);
      await tx.order.update({
        where: { id: orderId },
        data: { creditApplied: order.creditApplied + applied, giftCardId: card.id },
        select: { id: true },
      });
      await tx.giftCard.update({ where: { id: card.id }, data: { balance: card.balance - applied } });
      await tx.giftCardTxn.create({
        data: { restaurantId: staff.restaurantId, giftCardId: card.id, amount: -applied, kind: "redeem", orderId },
      });
      await writeAudit(tx, staff.restaurantId, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "giftcard.redeem",
        entityType: "order",
        entityId: orderId,
        after: { giftCardId: card.id, applied },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't apply the gift card." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, applied, tables: await getCashierTables() };
}

/** Remove a redeemed gift card from an unpaid order, restoring its balance. */
export async function removeGiftCard(orderId: string): Promise<ApplyResult> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        select: { id: true, creditApplied: true, giftCardId: true },
      });
      if (!order || !order.giftCardId || order.creditApplied <= 0) return;
      await tx.giftCard.update({
        where: { id: order.giftCardId },
        data: { balance: { increment: order.creditApplied } },
      });
      await tx.giftCardTxn.create({
        data: { restaurantId: staff.restaurantId, giftCardId: order.giftCardId, amount: order.creditApplied, kind: "restore", orderId },
      });
      await tx.order.update({ where: { id: orderId }, data: { creditApplied: 0, giftCardId: null }, select: { id: true } });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the gift card." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, applied: 0, tables: await getCashierTables() };
}
