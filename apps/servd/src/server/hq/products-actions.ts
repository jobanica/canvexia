"use server";

import { revalidatePath } from "next/cache";
import { PRODUCTS } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";
import { requireHqAction } from "./auth";
import { partnersBelowFloor } from "./products";

export type ProductState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string }
  | {
      /** The confirmation step a floor change has to pass through. */
      status: "confirm";
      message: string;
      planId: string;
      floorCentavos: number;
      below: { partnerId: string; partnerName: string; priceMonthly: number }[];
    };

export async function saveProductAction(
  _prev: ProductState,
  formData: FormData,
): Promise<ProductState> {
  let actor;
  try {
    actor = await requireHqAction("products.write");
  } catch {
    return { status: "error", message: "You do not have permission to edit products." };
  }

  const productId = String(formData.get("productId") ?? "").trim();
  if (!(productId in PRODUCTS)) {
    // A product cannot be created from HQ — the registry decides what exists.
    return { status: "error", message: "That product is not in the registry." };
  }

  const status = String(formData.get("status") ?? "coming").trim();
  if (!["live", "beta", "coming"].includes(status)) {
    return { status: "error", message: "Pick a status." };
  }
  const trainingUrl = String(formData.get("trainingUrl") ?? "").trim() || null;
  const demoAccountRef = String(formData.get("demoAccountRef") ?? "").trim() || null;
  const defaultEnabled = formData.get("defaultEnabled") === "on";

  try {
    await systemDb(async (tx) => {
      const before = await tx.productSetting.findUnique({ where: { productId } });
      await tx.productSetting.upsert({
        where: { productId },
        create: { productId, status, trainingUrl, demoAccountRef, defaultEnabled },
        update: { status, trainingUrl, demoAccountRef, defaultEnabled },
      });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: "product.updated",
        entityType: "product_setting",
        entityId: productId,
        before: before
          ? { status: before.status, defaultEnabled: before.defaultEnabled }
          : null,
        after: { status, defaultEnabled },
      });
    });
    revalidatePath("/hq/products");
    revalidatePath("/partner");

    const registry = PRODUCTS[productId as keyof typeof PRODUCTS];
    return {
      status: "done",
      message:
        status === "live" && !registry.live
          ? `${registry.name} saved, but it still shows as beta: the registry marks it not provisionable, and the code wins.`
          : `${registry.name} saved.`,
    };
  } catch {
    return { status: "error", message: "Could not save that product." };
  }
}

/**
 * Change a plan's floor.
 *
 * TWO STEPS, because the brief requires it and because the reason is real:
 * raising a floor re-prices other people's businesses. The first submit returns
 * the list of partners currently under the proposed floor and writes nothing;
 * only a second submit carrying `confirm` writes.
 *
 * Super admin only — one of the four the brief denies to ops.
 */
export async function setPlanFloorAction(
  _prev: ProductState,
  formData: FormData,
): Promise<ProductState> {
  let actor;
  try {
    actor = await requireHqAction("plans.floor");
  } catch {
    return { status: "error", message: "Only a super admin can change a plan floor." };
  }

  const planId = String(formData.get("planId") ?? "").trim();
  const rawPesos = String(formData.get("floor") ?? "").trim().replace(/[,₱\s]/g, "");
  const pesos = Number(rawPesos);
  if (!Number.isFinite(pesos) || pesos < 0) {
    return { status: "error", message: "The floor is not a number." };
  }
  const floorCentavos = Math.round(pesos * 100);

  const below = await partnersBelowFloor(planId, floorCentavos);

  if (formData.get("confirm") !== "yes") {
    return {
      status: "confirm",
      planId,
      floorCentavos,
      below,
      message:
        below.length === 0
          ? "Nobody is priced below that. Confirm to set it."
          : `${below.length} partner${below.length === 1 ? " is" : "s are"} priced below that floor.`,
    };
  }

  try {
    const message = await systemDb(async (tx) => {
      const plan = await tx.plan.findUnique({
        where: { id: planId },
        select: { name: true, priceFloor: true },
      });
      if (!plan) throw new Error("GONE");

      await tx.plan.update({ where: { id: planId }, data: { priceFloor: floorCentavos } });
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: "plan.floor_set",
        entityType: "plan",
        entityId: planId,
        before: { priceFloor: plan.priceFloor },
        // Who it affected, recorded at the moment it was set — the list changes
        // as partners re-price, and "who did this break" is asked later.
        after: {
          priceFloor: floorCentavos,
          partnersBelow: below.map((b) => b.partnerName),
        },
      });

      return below.length === 0
        ? `${plan.name} floor set to ₱${pesos.toLocaleString("en-PH")}.`
        : `${plan.name} floor set to ₱${pesos.toLocaleString("en-PH")}. ${below.length} partner${below.length === 1 ? "" : "s"} now price below it — existing prices are NOT changed, but new ones are refused.`;
    });

    revalidatePath("/hq/products");
    return { status: "done", message };
  } catch (e) {
    if (e instanceof Error && e.message === "GONE") {
      return { status: "error", message: "That plan no longer exists." };
    }
    return { status: "error", message: "Could not set that floor." };
  }
}

/** Turn a product capability on or off, globally. */
export async function toggleFlagAction(
  _prev: ProductState,
  formData: FormData,
): Promise<ProductState> {
  let actor;
  try {
    actor = await requireHqAction("products.write");
  } catch {
    return { status: "error", message: "You do not have permission to change flags." };
  }

  const productId = String(formData.get("productId") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  const enabled = formData.get("enabled") === "on";
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!(productId in PRODUCTS)) {
    return { status: "error", message: "That product is not in the registry." };
  }
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(key)) {
    return {
      status: "error",
      message: "A flag key is lowercase letters, numbers and . _ - — it goes in code.",
    };
  }

  try {
    await systemDb(async (tx) => {
      // GLOBAL only in this phase: partnerId stays null. The column exists so
      // per-partner flags are a row later rather than a migration during a
      // launch — but nothing writes one yet, and a UI that half-supported it
      // would produce rows nothing reads.
      const existing = await tx.featureFlag.findFirst({
        where: { productId, key, partnerId: null },
        select: { id: true, enabled: true },
      });
      if (existing) {
        await tx.featureFlag.update({ where: { id: existing.id }, data: { enabled, note } });
      } else {
        await tx.featureFlag.create({ data: { productId, key, enabled, note } });
      }
      await writeHqAudit(tx, {
        actorEmail: actor.email,
        action: "flag.set",
        entityType: "feature_flag",
        entityId: `${productId}:${key}`,
        before: existing ? { enabled: existing.enabled } : null,
        after: { enabled },
      });
    });
    revalidatePath("/hq/products");
    return { status: "done", message: `${key} is ${enabled ? "on" : "off"}.` };
  } catch {
    return { status: "error", message: "Could not save that flag." };
  }
}
