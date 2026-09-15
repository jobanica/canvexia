"use server";

import { revalidatePath } from "next/cache";
import { PRODUCTS, isProductId } from "@servd/core";
import { requireWritablePartner } from "@/server/partners/auth";
import { provisionMerchantForPartner } from "@/server/products";

export type ProvisionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * A partner opening a merchant account in one of the products.
 *
 * This action knows the word "product" and nothing else — no restaurants, no
 * pharmacies. Which product it is resolves through the adapter registry, so
 * adding the laundry app means registering an adapter, not editing this file
 * (D36).
 *
 * The partner comes from the session. `provisionMerchantForPartner` re-checks
 * that they are approved before dispatching, so a partner suspended between
 * page load and submit cannot keep signing merchants.
 */
export async function provisionMerchantAction(
  _prev: ProvisionState,
  formData: FormData,
): Promise<ProvisionState> {
  const who = await requireWritablePartner("merchants.create");
  if (!who) {
    return { status: "error", message: "Your partner account can't open a merchant." };
  }
  const partner = who.partner;

  const productId = String(formData.get("productId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!isProductId(productId)) {
    return { status: "error", message: "Choose which product this account is for." };
  }
  if (!name) {
    return { status: "error", message: "Give the business a name." };
  }
  if (name.length > 120) {
    return { status: "error", message: "That name is too long." };
  }

  const outcome = await provisionMerchantForPartner(productId, partner.id, {
    name,
    address: address || undefined,
    phone: phone || undefined,
    // Recorded on the audit row so the merchant's creation names a person, the
    // same way its activation does.
    extra: { actorEmail: partner.email },
  });

  if (!outcome.ok) return { status: "error", message: outcome.message };

  revalidatePath("/partner");
  return {
    status: "done",
    message: `${name} is set up in ${PRODUCTS[productId].name}. It starts inactive — the merchant records their details, then you switch it on below.`,
  };
}
