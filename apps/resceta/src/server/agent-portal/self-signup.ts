import "server-only";
import { newEventId, normalizeReferralCode } from "@servd/core/agent-kit";
import { enqueueProductEvent, provisionPharmacyIn } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";
import { productSlug } from "./config";

/**
 * A pharmacy owner signs themselves up (D37) — the way an agent's customer
 * arrives. The pharmacy is created through the same `provisionPharmacyIn` the
 * partner portal uses, owned by the HOUSE partner (CANVEXIA's own operator
 * account, HOUSE_PARTNER_EMAIL), so it is created `pending` and is activated
 * the way every pharmacy is: once its FDA Licence to Operate is on file
 * (D36). Self-signup does not get a shortcut past the licence.
 *
 * The owner's staff row and customer.signed_up are written in the same
 * transaction as the pharmacy.
 */
export async function signUpPharmacy(input: {
  authUserId: string;
  email: string;
  pharmacyName: string;
  ownerName: string;
  phone: string;
  agentCode: string | null;
}): Promise<{ ok: true; pharmacyId: string } | { ok: false; error: string }> {
  const houseEmail = (process.env.HOUSE_PARTNER_EMAIL ?? "davao@canvexia.ph").toLowerCase();
  return systemDb(async (tx) => {
    const house = await tx.partner.findUnique({ where: { email: houseEmail }, select: { id: true } });
    if (!house) return { ok: false as const, error: "Sign-up is not open yet. Please contact support." };
    const pharmacy = await provisionPharmacyIn(tx, {
      partnerId: house.id,
      name: input.pharmacyName,
      phone: input.phone,
      email: input.email,
      actorEmail: input.email,
    });
    await tx.pharmacyStaff.create({
      data: { pharmacyId: pharmacy.id, authUserId: input.authUserId, email: input.email, role: "owner", displayName: input.ownerName },
      select: { id: true },
    });
    await enqueueProductEvent(tx, productSlug(), {
      event_id: newEventId(),
      type: "customer.signed_up",
      occurred_at: new Date().toISOString(),
      data: {
        external_customer_id: pharmacy.id,
        business_name: input.pharmacyName,
        owner_name: input.ownerName,
        owner_phone: input.phone,
        agent_code: normalizeReferralCode(input.agentCode) ?? null,
        plan: null,
      },
    });
    return { ok: true as const, pharmacyId: pharmacy.id };
  });
}
