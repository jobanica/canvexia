"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { pesosToCentavos } from "@/lib/money";

export type PromoFormState = { ok?: boolean; error?: string } | null;

const TYPES = ["info", "percent", "amount", "free_delivery", "free_item", "bogo"] as const;

const schema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(80),
    description: z.string().trim().max(300).optional().or(z.literal("")),
    type: z.enum(TYPES),
    valueRaw: z.string().trim().optional(), // percent (1-100) or pesos, per type
    code: z
      .string()
      .trim()
      .max(24)
      .optional()
      .or(z.literal(""))
      .transform((c) => (c ? c.toUpperCase().replace(/\s+/g, "") : "")),
    freeItemId: z.string().trim().optional().or(z.literal("")),
    minSpendRaw: z.string().trim().optional(),
    expiresAt: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "info" && !v.code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A coupon code is required for redeemable offers.", path: ["code"] });
    }
    if ((v.type === "free_item" || v.type === "bogo") && !v.freeItemId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick the item for this offer.", path: ["freeItemId"] });
    }
    if (v.type === "percent") {
      const n = Number(v.valueRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a percentage between 1 and 100.", path: ["valueRaw"] });
      }
    }
    if (v.type === "amount") {
      const n = Number(v.valueRaw);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a peso amount.", path: ["valueRaw"] });
      }
    }
  });

function fields(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    type: formData.get("type") ?? "info",
    valueRaw: formData.get("value") ?? "",
    code: formData.get("code") ?? "",
    freeItemId: formData.get("freeItemId") ?? "",
    minSpendRaw: formData.get("minSpend") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
  };
}

export async function createPromotion(
  _prev: PromoFormState,
  formData: FormData,
): Promise<PromoFormState> {
  const staff = await requireStaff(["admin", "manager"]);
  const parsed = schema.safeParse(fields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  const value =
    v.type === "percent"
      ? Math.round(Number(v.valueRaw))
      : v.type === "amount"
        ? pesosToCentavos(Number(v.valueRaw) || 0)
        : 0;
  const minSpend = v.minSpendRaw ? pesosToCentavos(Number(v.minSpendRaw) || 0) : 0;
  const expiresAt = v.expiresAt ? new Date(v.expiresAt) : null;

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      // Enforce coupon-code uniqueness per restaurant (case-insensitive).
      if (v.code) {
        const existing = await tx.promotion.findMany({
          where: { restaurantId: staff.restaurantId },
          select: { code: true },
        });
        if (existing.some((d) => (d.code ?? "").toUpperCase() === v.code)) {
          throw new Error("DUPLICATE_CODE");
        }
      }
      await tx.promotion.create({
        data: {
          restaurantId: staff.restaurantId,
          title: v.title,
          description: v.description || null,
          type: v.type,
          value,
          code: v.code || null,
          freeItemId: v.type === "free_item" || v.type === "bogo" ? v.freeItemId || null : null,
          minSpend,
          expiresAt,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "DUPLICATE_CODE") {
      return { error: "That coupon code is already used by another promotion." };
    }
    // Surface the real DB error so a misconfiguration (missing column, RLS, etc.)
    // is diagnosable instead of hidden behind a generic message.
    const detail = e instanceof Error ? e.message.split("\n").slice(-1)[0].trim() : "";
    return {
      error: detail
        ? `Couldn't save the promotion: ${detail}`
        : "Couldn't save the promotion. Make sure the database migration has been run.",
    };
  }

  revalidatePath("/admin/promotions");
  return { ok: true };
}

export async function deletePromotion(formData: FormData): Promise<void> {
  const staff = await requireStaff(["admin", "manager"]);
  const id = String(formData.get("id") ?? "");
  await tenantDb(staff.restaurantId, (tx) =>
    tx.promotion.deleteMany({ where: { id, restaurantId: staff.restaurantId } }),
  );
  revalidatePath("/admin/promotions");
}

export async function togglePromotion(formData: FormData): Promise<void> {
  const staff = await requireStaff(["admin", "manager"]);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await tenantDb(staff.restaurantId, (tx) =>
    tx.promotion.updateMany({
      where: { id, restaurantId: staff.restaurantId },
      data: { active: !active },
    }),
  );
  revalidatePath("/admin/promotions");
}
