import "server-only";
import { registerProductAdapter, type ProductAdapter, type ProvisionInput } from "@servd/core";
import { provisionPharmacyIn } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Resceta, as seen from the CANVEXIA portal.
 *
 * The portal runs in this process, so this is the adapter that actually gets
 * dispatched to when a partner signs a pharmacy up. Resceta registers its own
 * copy in its own process for its own provisioning path; both call the SAME
 * `provisionPharmacyIn` from `@servd/db`, which is the point — two
 * implementations of merchant creation drifting apart is the failure D36 exists
 * to prevent, and the drift would be silent.
 *
 * This file is the whole of what "add a vertical to the portal" costs: an
 * adapter and an import. The portal itself still knows nothing about
 * pharmacies.
 */
export const pharmacyAdapter: ProductAdapter = {
  productId: "pharmacy",

  async provisionMerchant(input: ProvisionInput) {
    const extra = input.extra ?? {};
    const pharmacy = await systemDb((tx) =>
      provisionPharmacyIn(tx, {
        partnerId: input.partnerId,
        name: input.name,
        address: input.address,
        phone: input.phone,
        logoUrl: input.logoUrl,
        tagline: input.tagline,
        // Optional at signup and chased later — the partner cannot activate the
        // pharmacy until the LTO is recorded, so an empty one here is a normal
        // state rather than a missing field.
        fdaLtoNumber: asString(extra.fdaLtoNumber),
        prcLicenseNo: asString(extra.prcLicenseNo),
        tin: asString(extra.tin),
        actorEmail: asString(extra.actorEmail),
      }),
    );

    // The slug written, read back from the create rather than recomputed —
    // uniqueness is settled inside provisionPharmacyIn and guessing it here
    // would eventually disagree.
    return { merchantId: pharmacy.id, slug: pharmacy.slug };
  },
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

registerProductAdapter(pharmacyAdapter);
