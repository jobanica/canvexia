import "server-only";
import { registerProductAdapter, type ProductAdapter, type ProvisionInput } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { provisionDemo } from "@/server/storefront-demo/provision";

/**
 * Servd, as a CANVEXIA product.
 *
 * The whole job of this file is to be the ONLY place that knows a CANVEXIA
 * "merchant" is a Servd "restaurant". Everything above it — the portal, the
 * dispatch, the product registry — deals in merchants; everything below it deals
 * in restaurants, exactly as it did before CANVEXIA existed.
 *
 * It wraps the existing provisionDemo rather than reimplementing creation. That
 * function already handles the things easy to get wrong on a second attempt: a
 * unique slug, a complimentary open-ended trial so online ordering is unlocked
 * while the partner is pitching, and the receipt header. Re-creating any of that
 * here would be a second creation path to keep in step with the first.
 */
export const servdAdapter: ProductAdapter = {
  productId: "servd",

  async provisionMerchant(input: ProvisionInput) {
    const restaurantId = await provisionDemo({
      name: input.name,
      tagline: input.tagline ?? "",
      address: input.address ?? "",
      phone: input.phone ?? "",
      logoUrl: input.logoUrl ?? "",
      // Ownership. provisionDemo writes this to BOTH demoPartnerId (who built
      // it) and partnerId (who owns it) — see the comment there, and D13 for why
      // those are different questions.
      demoPartnerId: input.partnerId,
    });

    // provisionDemo assigns the slug (it has to, to guarantee uniqueness), so it
    // is read back rather than guessed.
    const row = await systemDb((tx) =>
      tx.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } }),
    );

    /**
     * WHO OPENED IT, on the record.
     *
     * The pharmacy adapter has written this since it shipped; this one dropped
     * `input.extra.actorEmail` on the floor, so a restaurant's creation named
     * nobody — and the comment at the call site claiming otherwise was true of
     * exactly half the products.
     *
     * It matters beyond tidiness: provisioning now assigns the merchant to the
     * seat that opened it, and when that write fails this row is the only thing
     * left that can say who it should have been.
     *
     * Best-effort. The merchant exists and belongs to the partner either way; a
     * failed log entry must not cost somebody the account they just sold.
     */
    try {
      const actorEmail =
        typeof input.extra?.actorEmail === "string" ? input.extra.actorEmail : null;
      await systemDb((tx) =>
        tx.auditLog.create({
          data: {
            partnerId: input.partnerId,
            actorType: "partner",
            actorEmail,
            action: "merchant.provision",
            entityType: "merchant",
            entityId: restaurantId,
            after: { name: input.name, slug: row?.slug ?? "", productId: "servd" },
          },
        }),
      );
    } catch {
      /* the merchant stands */
    }

    return { merchantId: restaurantId, slug: row?.slug ?? "" };
  },
};

registerProductAdapter(servdAdapter);
