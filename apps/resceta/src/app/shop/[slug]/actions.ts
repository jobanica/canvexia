"use server";

import { placeOrder, shopBySlug } from "@/server/pharmacy/storefront";

export type ShopState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; orderNumber: string };

/**
 * A customer sending an order request.
 *
 * NO SESSION, AND NO PHARMACY ID IN THE FORM. The slug comes from the URL and
 * is resolved here — a pharmacy id in the body would let anybody file an order
 * against any pharmacy, which is the one cross-tenant hole a public form could
 * open.
 *
 * `shopBySlug` also refuses a pharmacy whose storefront is off or whose account
 * is not active, so a page cached in somebody's browser cannot keep taking
 * orders after it is switched off.
 */
export async function submitOrder(_prev: ShopState, formData: FormData): Promise<ShopState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const shop = slug ? await shopBySlug(slug) : null;
  if (!shop) {
    return { status: "error", message: "This shop is not taking orders at the moment." };
  }

  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const lines = [];
  for (let i = 0; i < productIds.length; i += 1) {
    const raw = (quantities[i] ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      return { status: "error", message: "Quantities come in whole units." };
    }
    if (n > 0) lines.push({ productId: productIds[i]!, quantity: n });
  }

  const fulfilment = String(formData.get("fulfilment") ?? "pickup");
  // Delivery only if this pharmacy offers it, whatever the form says.
  const mode: "pickup" | "delivery" =
    fulfilment === "delivery" && shop.acceptsDelivery ? "delivery" : "pickup";

  const res = await placeOrder({
    pharmacyId: shop.id,
    customerName: String(formData.get("customerName") ?? ""),
    customerPhone: String(formData.get("customerPhone") ?? ""),
    customerAddress: String(formData.get("customerAddress") ?? "") || null,
    fulfilment: mode,
    notes: String(formData.get("notes") ?? "") || null,
    lines,
  });
  if (!res.ok) return { status: "error", message: res.error };

  return { status: "done", orderNumber: res.orderNumber };
}
