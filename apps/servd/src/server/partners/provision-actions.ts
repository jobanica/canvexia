"use server";

import { revalidatePath } from "next/cache";
import { PRODUCTS, isProductId } from "@servd/core";
import { requireWritablePartner } from "@/server/partners/auth";
import { provisionMerchantForPartner } from "@/server/products";
import { systemDb } from "@/server/tenancy/scoped-db";
import { captureConsent } from "@/server/partners/sms-contacts";

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
    // same way its activation does. Both adapters write it now — the Servd one
    // used to drop it, which made this comment true of half the products.
    extra: { actorEmail: partner.email },
  });

  if (!outcome.ok) return { status: "error", message: outcome.message };

  /**
   * THE SEAT THAT OPENED IT OWNS IT, AND SUPPORTS IT.
   *
   * REPORTED — "all the merchants that I activated will be supported by the
   * agent who created it, so partner can see who activated it and if have
   * problem, knows who to call."
   *
   * `assignedSalesUserId` was READ in five places — the commission run, the
   * staff scorecard, the staff detail screen, and both reassignment paths — and
   * written by NONE of them at the moment a merchant was opened. So a field
   * agent signed a shop and their commission was zero, their scorecard was
   * empty, and the merchant's own page read "Signed by: Nobody yet". The column
   * existed, the readers existed, nothing ever filled it in.
   *
   * BOTH COLUMNS, because at this size they are the same person: the agent who
   * signed the shop is who that shop rings when the printer dies. An operator
   * can move support to somebody else later — `reassignStaffMerchants` already
   * does exactly that — and the point is that it starts somewhere real rather
   * than nowhere.
   *
   * A LEGACY LOGIN HAS NO SEAT, so there is nobody to credit and the columns
   * stay null, which is what they have always been for those accounts.
   *
   * AFTER PROVISIONING AND NEVER INSIDE IT. The merchant is created and
   * belongs to the partner either way; an attribution that failed must not cost
   * somebody the account they just sold. A failure is logged and leaves the
   * merchant page reading "Nobody yet", which is a visible, fixable state
   * rather than a silent wrong answer.
   */
  const seatId = who.userId;
  if (seatId) {
    try {
      await systemDb(async (tx) => {
        const data = { assignedSalesUserId: seatId, assignedSupportUserId: seatId };
        // Ownership in the WHERE clause on both axes, so a merchant belonging
        // to another partner matches zero rows rather than being stamped.
        const where = { id: outcome.result.merchantId, partnerId: partner.id };
        if (productId === "pharmacy") {
          await tx.pharmacy.updateMany({ where, data });
        } else {
          await tx.restaurant.updateMany({ where, data });
        }
      });
    } catch (e) {
      console.error(
        `Provisioned ${productId}:${outcome.result.merchantId} but could not assign seat ${seatId}`,
        e,
      );
    }
  }

  /**
   * The owner's SMS consent, asked on this one screen.
   *
   * SKIPPABLE, AND SKIPPING MEANS `unknown` — the brief's word. The box is
   * unticked, the field is empty, and neither produces a consent record: an
   * operator setting up an account at a counter often has not asked, and
   * inventing an answer either way would be a lie in the one column that has
   * to be defensible.
   *
   * After provisioning and never inside it: a consent capture that failed must
   * not cost somebody their merchant account.
   */
  const ownerMobile = String(formData.get("ownerMobile") ?? "").trim();
  const ownerConsent = String(formData.get("ownerSmsConsent") ?? "") === "on";
  if (ownerMobile && ownerConsent) {
    await captureConsent({
      partnerId: partner.id,
      mobile: ownerMobile,
      consented: true,
      source: "merchant_owner",
      origin: "merchant_owner",
      name: String(formData.get("ownerName") ?? "").trim() || null,
      businessName: name,
      productId,
      merchantId: outcome.result.merchantId,
      staffName: partner.user.name ?? partner.email,
      staffEmail: partner.email,
    });
  }

  revalidatePath("/partner");
  return {
    status: "done",
    message: `${name} is set up in ${PRODUCTS[productId].name}. It starts inactive — the merchant records their details, then you switch it on below.`,
  };
}
