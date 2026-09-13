"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { pesosToCentavos } from "@/lib/money";
import type { HappyHourRule } from "@/lib/pricing/happy-hour";

/**
 * Happy-hour rules. Reads are best-effort (the table may lag pre-migration →
 * treated as "no happy hour"). Writes are admin-only and tenant-scoped.
 */

export interface HappyHourRow extends HappyHourRule {
  name: string;
  active: boolean;
}

const SELECT = {
  id: true,
  name: true,
  discountType: true,
  value: true,
  scope: true,
  targetIds: true,
  days: true,
  startMinute: true,
  endMinute: true,
  active: true,
} as const;

/** Active rules for pricing (public/system context — diners have no session). */
export async function getActiveHappyHours(restaurantId: string): Promise<HappyHourRule[]> {
  try {
    return await systemDb((tx) =>
      tx.happyHour.findMany({ where: { restaurantId, active: true }, select: SELECT }),
    );
  } catch {
    return []; // not migrated yet
  }
}

/** Active rules within a tenant transaction (used by server-side order pricing). */
export async function getActiveHappyHoursTenant(restaurantId: string): Promise<HappyHourRule[]> {
  try {
    return await tenantDb(restaurantId, (tx) =>
      tx.happyHour.findMany({ where: { active: true }, select: SELECT }),
    );
  } catch {
    return [];
  }
}

/** All rules for the admin list. */
export async function listHappyHours(restaurantId: string): Promise<HappyHourRow[]> {
  try {
    return await tenantDb(restaurantId, (tx) =>
      tx.happyHour.findMany({ orderBy: { createdAt: "desc" }, select: SELECT }),
    );
  } catch {
    return [];
  }
}

export type FormState = { ok?: boolean; error?: string } | null;

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60),
    discountType: z.enum(["percent", "amount"]),
    valueRaw: z.string().trim(),
    scope: z.enum(["all", "category", "item"]),
    targetIds: z.array(z.string()).default([]),
    days: z.array(z.coerce.number().int().min(0).max(6)).default([]),
    start: z.string().trim(), // "HH:MM"
    end: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    const n = Number(v.valueRaw);
    if (!Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a discount value.", path: ["valueRaw"] });
    } else if (v.discountType === "percent" && n > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Percent must be 1–100.", path: ["valueRaw"] });
    }
    if (v.scope !== "all" && v.targetIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick at least one target.", path: ["targetIds"] });
    }
  });

function hhmm(s: string): number {
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return (h % 24) * 60 + (m % 60);
}

export async function createHappyHour(_prev: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const parsed = schema.safeParse({
    name: formData.get("name"),
    discountType: formData.get("discountType"),
    valueRaw: formData.get("value") ?? "",
    scope: formData.get("scope"),
    targetIds: formData.getAll("targetIds").map(String),
    days: formData.getAll("days").map(String),
    start: formData.get("start") ?? "",
    end: formData.get("end") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  const value =
    v.discountType === "percent" ? Math.round(Number(v.valueRaw)) : pesosToCentavos(Number(v.valueRaw) || 0);
  const startMinute = hhmm(v.start);
  const endMinute = hhmm(v.end);
  if (startMinute === endMinute) return { error: "Start and end time can't be the same." };

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.happyHour.create({
        data: {
          restaurantId,
          name: v.name,
          discountType: v.discountType,
          value,
          scope: v.scope,
          targetIds: v.scope === "all" ? [] : v.targetIds,
          days: v.days,
          startMinute,
          endMinute,
        },
      }),
    );
  } catch {
    return { error: "Couldn't save. Make sure the happy-hour migration has been run." };
  }
  revalidatePath("/admin/happy-hours");
  return { ok: true };
}

export async function toggleHappyHour(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await tenantDb(restaurantId, (tx) =>
    tx.happyHour.updateMany({ where: { id }, data: { active: !active } }),
  );
  revalidatePath("/admin/happy-hours");
}

export async function deleteHappyHour(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const id = String(formData.get("id") ?? "");
  await tenantDb(restaurantId, (tx) => tx.happyHour.deleteMany({ where: { id } }));
  revalidatePath("/admin/happy-hours");
}
