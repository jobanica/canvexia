import "server-only";
// Importing for the side effect: the adapter registers itself. Anything that
// dispatches must import THIS module rather than @servd/core directly, or the
// registry will be empty and every product will report "no adapter".
import "./servd-adapter";

import { provisionMerchant as dispatch, type ProvisionInput, type ProvisionOutcome } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Create a merchant in a product, on behalf of a partner.
 *
 * The single entry point the brief asks for. The portal calls this and knows
 * nothing about restaurants, menus or tables.
 *
 * The partner checks live HERE and not in core, because core has no database and
 * should not grow one: it knows what a product is, not who is allowed to sell
 * it. Keeping the split there is what lets a second app register its own adapter
 * without inheriting Servd's idea of a partner.
 */
export async function provisionMerchantForPartner(
  productId: string,
  partnerId: string,
  payload: Omit<ProvisionInput, "partnerId">,
): Promise<ProvisionOutcome> {
  // An unapproved partner cannot open accounts. Checked before dispatch so a
  // suspended operator cannot keep signing merchants while a dispute is open.
  const partner = await systemDb((tx) =>
    tx.partner.findUnique({ where: { id: partnerId }, select: { status: true } }),
  ).catch(() => null);

  if (!partner) {
    return { ok: false, reason: "invalid_input", message: "That partner no longer exists." };
  }
  if (partner.status !== "approved") {
    return {
      ok: false,
      reason: "invalid_input",
      message: `Your partner account is ${partner.status}, so it can't open new accounts yet.`,
    };
  }

  return dispatch(productId, partnerId, payload);
}

export { provisionableProducts } from "@servd/core";
