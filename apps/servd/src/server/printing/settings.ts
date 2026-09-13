"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { percentToBp } from "@/lib/printing/printer-config";
import type { PrintMethod } from "@prisma/client";

export type FormState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  printMethod: z.enum(["network", "cloud", "bluetooth", "os_dialog"]),
  autoPrint: z.coerce.boolean().default(false),
  kitchenDisplay: z.coerce.boolean().default(true),
  bridgeUrl: z.string().url().optional().or(z.literal("")),
  receiptAddress: z.string().max(120).optional(),
  receiptPhone: z.string().max(60).optional(),
  receiptWebsite: z.string().max(120).optional(),
  receiptFooter: z.string().max(300).optional(),
  receiptShowVat: z.coerce.boolean().default(true),
  receiptShowCustomer: z.coerce.boolean().default(true),
  receiptShowCashTendered: z.coerce.boolean().default(true),
  kitchenShowAddress: z.coerce.boolean().default(false),
  // A separate printer at the pass. Server-driven transports only — see
  // KitchenPrintMethod for why a browser one can't be aimed at another room.
  kitchenSeparate: z.coerce.boolean().default(false),
  kitchenMethod: z.enum(["network", "cloud", "bluetooth"]).default("network"),
  kitchenBridgeUrl: z.string().url().optional().or(z.literal("")),
  // Typed as a percentage ("3.5"); stored as basis points.
  cardSurchargePercent: z.string().max(10).optional(),
  payFirst: z.coerce.boolean().default(false),
  autoPrintReceipt: z.coerce.boolean().default(true),
  openDrawerOn: z.enum(["never", "cash", "any"]).default("cash"),
});

export async function updatePrintSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = schema.safeParse({
    printMethod: formData.get("printMethod"),
    autoPrint: formData.get("autoPrint") === "on",
    kitchenDisplay: formData.get("kitchenDisplay") === "on",
    bridgeUrl: formData.get("bridgeUrl") ?? "",
    receiptAddress: formData.get("receiptAddress") ?? "",
    receiptPhone: formData.get("receiptPhone") ?? "",
    receiptWebsite: formData.get("receiptWebsite") ?? "",
    receiptFooter: formData.get("receiptFooter") ?? "",
    receiptShowVat: formData.get("receiptShowVat") === "on",
    receiptShowCustomer: formData.get("receiptShowCustomer") === "on",
    receiptShowCashTendered: formData.get("receiptShowCashTendered") === "on",
    kitchenShowAddress: formData.get("kitchenShowAddress") === "on",
    kitchenSeparate: formData.get("kitchenSeparate") === "on",
    kitchenMethod: formData.get("kitchenMethod") ?? "network",
    kitchenBridgeUrl: formData.get("kitchenBridgeUrl") ?? "",
    cardSurchargePercent: String(formData.get("cardSurchargePercent") ?? ""),
    payFirst: formData.get("payFirst") === "on",
    autoPrintReceipt: formData.get("autoPrintReceipt") === "on",
    openDrawerOn: formData.get("openDrawerOn") ?? "cash",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }

  await tenantDb(restaurantId, async (tx) => {
    const current = await tx.restaurant.findFirstOrThrow({
      select: { printerConfig: true },
    });
    const cfg = (current.printerConfig as Record<string, unknown> | null) ?? {};

    // Ensure a poll token exists for the cloud transport.
    if (parsed.data.printMethod === "cloud" && !cfg.pollToken) {
      cfg.pollToken = randomBytes(16).toString("hex");
    }
    if (parsed.data.bridgeUrl) cfg.bridgeUrl = parsed.data.bridgeUrl;

    // Receipt branding (trim to null so blanks don't print empty lines).
    const trimOrNull = (s?: string) => {
      const v = (s ?? "").trim();
      return v.length ? v : null;
    };
    cfg.receipt = {
      address: trimOrNull(parsed.data.receiptAddress),
      phone: trimOrNull(parsed.data.receiptPhone),
      website: trimOrNull(parsed.data.receiptWebsite),
      footer: trimOrNull(parsed.data.receiptFooter),
      showVat: parsed.data.receiptShowVat,
      showCustomer: parsed.data.receiptShowCustomer,
      showCashTendered: parsed.data.receiptShowCashTendered,
    };
    // The kitchen printer. Its poll token is generated once and then kept:
    // regenerating it on every save would silently orphan a printer that's
    // already been configured to poll with the old one.
    const prevKitchen = (cfg.kitchen ?? {}) as Record<string, unknown>;
    let kitchenPollToken = typeof prevKitchen.pollToken === "string" ? prevKitchen.pollToken : null;
    if (parsed.data.kitchenSeparate && parsed.data.kitchenMethod === "cloud" && !kitchenPollToken) {
      kitchenPollToken = randomBytes(16).toString("hex");
    }
    cfg.kitchen = {
      showAddress: parsed.data.kitchenShowAddress,
      separate: parsed.data.kitchenSeparate,
      method: parsed.data.kitchenMethod,
      // Keep the URL when the box is cleared but the printer is still on
      // network — an accidental blank shouldn't lose the address.
      bridgeUrl: parsed.data.kitchenBridgeUrl || (prevKitchen.bridgeUrl ?? null),
      pollToken: kitchenPollToken,
    };
    // Everything here rides in the JSON column that already exists, so these
    // four settings work the moment this deploys — no migration to wait on.
    cfg.payments = {
      payFirst: parsed.data.payFirst,
      cardSurchargeBp: percentToBp(parsed.data.cardSurchargePercent),
    };

    // Mark the printer method as deliberately chosen (drives onboarding).
    cfg.configured = true;

    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        printMethod: parsed.data.printMethod as PrintMethod,
        autoPrint: parsed.data.autoPrint,
        printerConfig: cfg as object,
      },
      select: { id: true },
    });
  });

  // Kitchen display/print toggle — best-effort so a lagging column can't block
  // the rest of the printer settings from saving.
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.updateMany({ where: { id: restaurantId }, data: { kitchenDisplay: parsed.data.kitchenDisplay } }),
    );
  } catch {
    /* kitchenDisplay column not migrated yet */
  }

  // Receipt-on-payment and cash-drawer behaviour. Written separately, and
  // best-effort, so a database that hasn't run the migration still saves every
  // other printer setting instead of rejecting the whole form.
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.updateMany({
        where: { id: restaurantId },
        data: {
          autoPrintReceipt: parsed.data.autoPrintReceipt,
          openDrawerOn: parsed.data.openDrawerOn,
        },
      }),
    );
  } catch {
    /* columns not migrated yet — see prisma/manual/add-drawer-receipt-settings.sql */
  }

  revalidatePath("/admin/printing");
  return { ok: true };
}
