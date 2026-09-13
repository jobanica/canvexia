"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { uploadMenuImage } from "@/server/storage/menu-images";
import { pesosToCentavos } from "@/lib/money";
import { getStorefront, type DayHours, type DeliveryZone } from "./storefront";
import {
  AUTO_ACCEPT_DEFAULT_SECONDS,
  normalizeAutoAcceptSeconds,
} from "@/lib/orders/auto-accept";

export type StorefrontState = { ok?: boolean; error?: string } | null;

export async function updateStorefront(
  _prev: StorefrontState,
  formData: FormData,
): Promise<StorefrontState> {
  const { restaurantId } = await requireAdminAction();

  // Hours: 7 days of open/close/closed.
  const hours: DayHours[] = Array.from({ length: 7 }, (_, i) => ({
    open: String(formData.get(`open_${i}`) ?? "09:00"),
    close: String(formData.get(`close_${i}`) ?? "21:00"),
    closed: formData.get(`closed_${i}`) === "on",
  }));

  // Delivery zones: parallel name[]/fee[] arrays.
  const names = formData.getAll("zoneName").map((v) => String(v).trim());
  const fees = formData.getAll("zoneFee").map((v) => Number(v) || 0);
  const zones: DeliveryZone[] = names
    .map((name, i) => ({ name, fee: pesosToCentavos(Math.max(0, fees[i] ?? 0)) }))
    .filter((z) => z.name);

  const pauseWhenClosed = formData.get("pauseWhenClosed") === "on";
  const acceptsBookings = formData.get("acceptsBookings") === "on";
  // Advance-order downpayment config.
  const dpType = formData.get("downpaymentType") === "fixed" ? "fixed" : "percent";
  const dpRaw = Number(formData.get("downpaymentValue")) || 0;
  const bookingConfig = {
    requireDownpayment: formData.get("requireDownpayment") === "on",
    downpaymentType: dpType,
    // Percent stays a whole number; a fixed peso amount is stored in centavos.
    downpaymentValue: dpType === "percent" ? Math.max(0, Math.min(100, Math.round(dpRaw))) : pesosToCentavos(Math.max(0, dpRaw)),
    downpaymentInstructions: String(formData.get("downpaymentInstructions") ?? "").trim().slice(0, 500),
  };
  // Payment methods (manual e-wallet / bank QR + cash). Each QR is either a
  // freshly uploaded image or the previously-saved URL passed back via a hidden
  // field. Resolve all three (GCash / Maya / Bank) the same way.
  async function resolveQr(prefix: string, label: string): Promise<string | { error: string }> {
    let url = String(formData.get(`${prefix}QrUrl`) ?? "").trim();
    const file = formData.get(`${prefix}Qr`);
    if (file instanceof File && file.size > 0) {
      try {
        url = await uploadMenuImage(restaurantId, file);
      } catch (e) {
        return { error: e instanceof Error ? e.message : `Couldn't upload the ${label} QR image.` };
      }
    }
    return url.slice(0, 500);
  }
  const gcashQrUrl = await resolveQr("gcash", "GCash");
  if (typeof gcashQrUrl !== "string") return gcashQrUrl;
  const mayaQrUrl = await resolveQr("maya", "Maya");
  if (typeof mayaQrUrl !== "string") return mayaQrUrl;
  const bankQrUrl = await resolveQr("bank", "bank");
  if (typeof bankQrUrl !== "string") return bankQrUrl;

  const str = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  // The dine-in GCash QR toggle is set on the Tables page, not here — carry the
  // saved value over so saving the website settings never switches it off.
  const saved = await getStorefront(restaurantId);
  // REFUSE to save when the stored config couldn't be read. Everything the form
  // was prefilled with is then a default, and writing it back replaces the
  // shop's real payment and delivery settings with blanks. That is exactly how
  // a set of accounts lost their configuration; a failed read must never
  // become a successful overwrite.
  if (saved.configUnavailable) {
    return {
      error:
        "Couldn't load your saved settings just now, so nothing was written — this protects what you already have. Refresh and try again; if it keeps happening, the database needs its pending migration.",
    };
  }
  const savedPayment = saved.payment;
  const paymentConfig = {
    dineInGcashEnabled: savedPayment.dineInGcashEnabled,
    codEnabled: formData.get("codEnabled") === "on",
    codFeeEnabled: formData.get("codFeeEnabled") === "on",
    codFee: pesosToCentavos(Math.max(0, Number(formData.get("codFeePesos")) || 0)),
    gcashEnabled: formData.get("gcashEnabled") === "on",
    gcashName: str("gcashName", 120),
    gcashNumber: str("gcashNumber", 40),
    gcashQrUrl,
    mayaEnabled: formData.get("mayaEnabled") === "on",
    mayaName: str("mayaName", 120),
    mayaNumber: str("mayaNumber", 40),
    mayaQrUrl,
    bankEnabled: formData.get("bankEnabled") === "on",
    bankName: str("bankName", 120),
    bankNumber: str("bankNumber", 40),
    bankQrUrl,
    packagingFeeEnabled: formData.get("packagingFeeEnabled") === "on",
    packagingFee: pesosToCentavos(Math.max(0, Number(formData.get("packagingFeePesos")) || 0)),
    packagingFeeScope: formData.get("packagingFeeScope") === "all" ? "all" : "delivery",
    packagingFeeMode: formData.get("packagingFeeMode") === "item" ? "item" : "order",
    requireReceipt: formData.get("requireReceipt") === "on",
    showVat: formData.get("showVat") === "on",
  };
  // Delivery pricing: zones (fixed per area) or distance (base + per-km). Peso
  // inputs → centavos; the store origin comes from a pinned lat/lng.
  const dpNum = (k: string) => Number(formData.get(k)) || 0;
  const originLat = formData.get("originLat") ? Number(formData.get("originLat")) : null;
  const originLng = formData.get("originLng") ? Number(formData.get("originLng")) : null;
  const deliveryModeRaw = formData.get("deliveryMode");
  const deliveryConfig = {
    mode: deliveryModeRaw === "distance" ? "distance" : deliveryModeRaw === "shipping" ? "shipping" : "zones",
    baseFee: pesosToCentavos(Math.max(0, dpNum("baseFeePesos"))),
    perKm: pesosToCentavos(Math.max(0, dpNum("perKmPesos"))),
    freeKm: Math.max(0, dpNum("freeKm")),
    minFee: pesosToCentavos(Math.max(0, dpNum("minFeePesos"))),
    maxKm: Math.max(0, dpNum("maxKm")),
    roadFactor: dpNum("roadFactor") > 0 ? dpNum("roadFactor") : 1.3,
    originLat: originLat != null && Number.isFinite(originLat) ? originLat : null,
    originLng: originLng != null && Number.isFinite(originLng) ? originLng : null,
    // Checkbox: when unchecked, the delivery fee is NOT added to the order total
    // (the customer settles it with the rider directly).
    feeInTotal: formData.get("deliveryFeeInTotal") === "on",
    // Checkbox: when unchecked, the checkout map pin is hidden (typed address only).
    mapEnabled: formData.get("mapEnabled") === "on",
    // After placing, ask the customer to book their own rider (for stores with
    // no delivery fleet) + optional instructions on how.
    selfBookRider: formData.get("selfBookRider") === "on",
    selfBookRiderNote: String(formData.get("selfBookRiderNote") ?? "").trim().slice(0, 500),
    fulfillment: (() => {
      const f = String(formData.get("fulfillment") ?? "both");
      return f === "pickup" ? "pickup" : f === "delivery" ? "delivery" : "both";
    })(),
  };
  const hoursJson = hours as unknown as Prisma.InputJsonValue;
  const zonesJson = zones as unknown as Prisma.InputJsonValue;
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.storefrontSetting.upsert({
        where: { restaurantId },
        create: { restaurantId, hours: hoursJson, deliveryZones: zonesJson, pauseWhenClosed },
        update: { hours: hoursJson, deliveryZones: zonesJson, pauseWhenClosed },
        select: { id: true },
      }),
    );
  } catch (e) {
    // Name the column when the database says which one is missing. The old
    // message matched the word "storefront", which appears in EVERY Prisma
    // error on this model ("Invalid prisma.storefrontSetting.upsert()"), so
    // any failure at all was reported as "run the migration" — sending an
    // owner to look for a migration that was never the problem.
    const msg = String(e);
    const column = /column "?([A-Za-z_]+)"? does not exist/i.exec(msg)?.[1];
    return {
      error: column
        ? `Your database is missing the "${column}" column. Run the pending migration in Supabase, then try again — nothing was saved.`
        : "Couldn't save your settings, and nothing was changed. Try again; if it keeps happening, send us this screen.",
    };
  }
  // `acceptsBookings` / `bookingConfig` are newer columns — write them separately
  // so an un-migrated DB still saves hours/zones (they just won't stick yet).
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.storefrontSetting.update({
        where: { restaurantId },
        data: {
          acceptsBookings,
          bookingConfig: bookingConfig as unknown as Prisma.InputJsonValue,
          paymentConfig: paymentConfig as unknown as Prisma.InputJsonValue,
          deliveryConfig: deliveryConfig as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      }),
    );
  } catch {
    // Newer columns may lag — retry with just the toggle so the rest still saves.
    try {
      await tenantDb(restaurantId, (tx) =>
        tx.storefrontSetting.update({ where: { restaurantId }, data: { acceptsBookings }, select: { id: true } }),
      );
    } catch { /* columns not migrated yet */ }
  }
  revalidatePath("/admin/storefront");
  // ALSO refresh the customer-facing site — without this the storefront keeps
  // serving cached settings, so changes like "pick-up only", the VAT line or a
  // new delivery fee wouldn't show up for diners.
  revalidatePath("/r/[slug]", "page");
  revalidatePath("/sites/[host]", "page");
  return { ok: true };
}

export type PauseState = { ok?: boolean; paused?: boolean; error?: string } | null;

/**
 * Stop or resume online orders, immediately.
 *
 * Its own action rather than a field on the storefront form: this gets used
 * mid-service, one-handed, while the kitchen is shouting. Making somebody
 * scroll a long settings page and press Save to stop the orders arriving is
 * the wrong shape for the moment it's needed in.
 *
 * Writes with updateMany + a create fallback so a restaurant that has never
 * saved storefront settings can still pause.
 */
export async function setOrdersPaused(
  _prev: PauseState,
  formData: FormData,
): Promise<PauseState> {
  const { restaurantId } = await requireAdminAction();
  const paused = formData.get("paused") === "true";

  try {
    await tenantDb(restaurantId, async (tx) => {
      const res = await tx.storefrontSetting.updateMany({
        where: { restaurantId },
        data: { ordersPaused: paused },
      });
      if (res.count === 0) {
        await tx.storefrontSetting.create({
          data: { restaurantId, ordersPaused: paused },
          select: { id: true },
        });
      }
    });
  } catch {
    return {
      error:
        "Couldn't save that — run prisma/manual/add-orders-paused.sql, then try again.",
    };
  }

  revalidatePath("/admin/storefront");
  // The storefront itself, so a paused shop stops taking orders at once rather
  // than serving a cached page that still has a working checkout button.
  revalidatePath("/r/[slug]", "page");
  revalidatePath("/sites/[host]", "page");
  return { ok: true, paused };
}

export type AutoAcceptState = { ok?: boolean; seconds?: number | null; error?: string } | null;

/**
 * Turn auto-accept on or off, and set how long it waits.
 *
 * Its own action, like the pause switch above and for the same reason: it is
 * one decision, and making somebody scroll a long settings page and press Save
 * to change it is the wrong shape. It also keeps this entirely away from
 * `updateStorefront`, which writes the payment and delivery configuration —
 * the one write in this file that must not gain new failure modes.
 *
 * updateMany with a create fallback, so a shop that has never saved storefront
 * settings can still switch it on.
 */
export async function setAutoAccept(
  _prev: AutoAcceptState,
  formData: FormData,
): Promise<AutoAcceptState> {
  const { restaurantId } = await requireAdminAction();
  const on = formData.get("on") === "true";
  const seconds = on
    ? normalizeAutoAcceptSeconds(formData.get("seconds")) ?? AUTO_ACCEPT_DEFAULT_SECONDS
    : null;

  try {
    await tenantDb(restaurantId, async (tx) => {
      const res = await tx.storefrontSetting.updateMany({
        where: { restaurantId },
        data: { autoAcceptSeconds: seconds },
      });
      if (res.count === 0) {
        await tx.storefrontSetting.create({
          data: { restaurantId, autoAcceptSeconds: seconds },
          select: { id: true },
        });
      }
    });
  } catch {
    return {
      error: "Couldn't save that — run prisma/manual/add-auto-accept.sql, then try again.",
    };
  }

  revalidatePath("/admin/storefront");
  return { ok: true, seconds };
}
