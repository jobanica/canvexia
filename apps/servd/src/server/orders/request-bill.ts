"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged, notifyBillRequest } from "@/server/realtime/notify";
import { uploadMenuImageBytes } from "@/server/storage/menu-images";

/**
 * Store a data-URL screenshot and return its public URL.
 *
 * Mirrors the online-order path deliberately: same accepted types, same size
 * ceiling, same "returns null rather than throwing" contract, so a receipt
 * behaves identically whether it arrived from a table or the website.
 */
async function storeReceipt(restaurantId: string, dataUrl?: string): Promise<string | null> {
  if (!dataUrl) return null;
  try {
    const m = /^data:(image\/(png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return null;
    const bytes = Buffer.from(m[3], "base64");
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) return null;
    const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
    return await uploadMenuImageBytes(restaurantId, bytes, ext, m[1]);
  } catch {
    return null;
  }
}

const schema = z.object({
  slug: z.string().min(1),
  tableToken: z.string().min(1),
  method: z.enum(["cash", "online", "gcash_qr"]).optional(),
  /** GCash reference the diner typed. */
  reference: z.string().trim().max(64).optional(),
  /** Screenshot of the diner's payment, as a data URL. */
  receipt: z.string().optional(),
});

/** Resolve a table from the public slug + token (no session). */
async function resolveTable(slug: string, tableToken: string) {
  return systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug, status: "active" },
      select: { id: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: tableToken },
      select: { id: true, tableNumber: true },
    });
    if (!table) return null;
    return { restaurantId: restaurant.id, tableId: table.id, tableNumber: table.tableNumber };
  });
}

export interface TableBill {
  items: { name: string; quantity: number; lineTotal: number }[];
  subtotal: number; // centavos, gross (before any discount)
  discount: number; // centavos taken off
  credit: number; // centavos paid by redeemed gift card
  discountLabel: string | null; // e.g. "Promo SAVE20 · 20% off"
  total: number; // centavos, net payable (subtotal − discount − credit)
  orderCount: number;
}

/** The diner's current (outstanding) bill for their table — itemized + total. */
export async function getTableBill(input: {
  slug: string;
  tableToken: string;
}): Promise<{ ok: boolean; bill?: TableBill; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await resolveTable(parsed.data.slug, parsed.data.tableToken);
  if (!ctx) return { ok: false, error: "Table unavailable." };

  const orders = await tenantDb(ctx.restaurantId, (tx) =>
    tx.order.findMany({
      where: {
        tableId: ctx.tableId,
        status: { in: ["new", "preparing", "done"] },
        paymentStatus: { in: ["unpaid", "failed"] },
      },
      select: {
        total: true,
        discountAmount: true,
        discountLabel: true,
        creditApplied: true,
        items: {
          select: {
            quantity: true,
            nameAtTime: true,
            unitPrice: true,
            modifiers: { select: { priceDeltaAtTime: true } },
          },
        },
      },
    }),
  );

  const items: TableBill["items"] = [];
  let subtotal = 0;
  let discount = 0;
  let credit = 0;
  let discountLabel: string | null = null;
  for (const o of orders) {
    subtotal += o.total;
    discount += o.discountAmount ?? 0;
    credit += o.creditApplied ?? 0;
    if (o.discountLabel) discountLabel = o.discountLabel;
    for (const i of o.items) {
      const unit = i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0);
      items.push({ name: i.nameAtTime, quantity: i.quantity, lineTotal: unit * i.quantity });
    }
  }

  const total = Math.max(0, subtotal - discount - credit);
  return { ok: true, bill: { items, subtotal, discount, credit, discountLabel, total, orderCount: orders.length } };
}

/**
 * Diner-triggered "request the bill". No session — authorized by the table
 * token in the URL. Flags every open order at the table so the cashier board
 * lights up, then pings the live screens. When `method` is given (the diner
 * chose how to pay), staff get a popup — cash means a waiter must collect,
 * `gcash_qr` means a waiter must bring the store's printed GCash QR over.
 */
/**
 * Flag the table for the cashier, and carry the diner's proof of payment with
 * it if they sent one.
 *
 * The proof is the part that was missing. A diner paying the printed GCash QR
 * had no way to send anything, so the cashier saw "verify first" against a
 * blank space and had to go and ask — which is fine at one table and hopeless
 * at eight. Attaching it here puts the screenshot on the same card as the bill.
 *
 * Everything about the proof is best-effort: it is evidence for a human to
 * look at, never money. A failed upload must not stop a diner asking for their
 * bill, and no amount of proof marks anything paid — a cashier still does that.
 */
export async function requestBill(input: {
  slug: string;
  tableToken: string;
  method?: "cash" | "online" | "gcash_qr";
  reference?: string;
  receipt?: string;
}): Promise<{ ok: boolean; flagged?: number; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await resolveTable(parsed.data.slug, parsed.data.tableToken);
  if (!ctx) return { ok: false, error: "Table unavailable." };

  const result = await tenantDb(ctx.restaurantId, (tx) =>
    tx.order.updateMany({
      where: {
        tableId: ctx.tableId,
        status: { in: ["new", "preparing", "done"] },
      },
      data: { billRequested: true },
    }),
  );

  if (result.count === 0) {
    return { ok: false, error: "No open orders to bill yet." };
  }

  // Stamp the diner's payment details onto the open orders so the cashier's
  // card can show them. Separate write, in a try: these are newer columns, and
  // a database that hasn't caught up must still be able to call for the bill.
  if (parsed.data.method === "gcash_qr") {
    try {
      const receiptUrl = await storeReceipt(ctx.restaurantId, parsed.data.receipt);
      await tenantDb(ctx.restaurantId, (tx) =>
        tx.order.updateMany({
          where: { tableId: ctx.tableId, status: { in: ["new", "preparing", "done"] } },
          data: {
            paymentChoice: "gcash",
            ...(parsed.data.reference ? { paymentRef: parsed.data.reference } : {}),
            ...(receiptUrl ? { paymentReceiptUrl: receiptUrl } : {}),
          },
        }),
      );
    } catch {
      /* columns not migrated, or the upload failed — the bill request stands */
    }
  }

  await notifyOrdersChanged(ctx.restaurantId);
  if (parsed.data.method) {
    await notifyBillRequest(ctx.restaurantId, ctx.tableNumber, parsed.data.method);
  }
  return { ok: true, flagged: result.count };
}
