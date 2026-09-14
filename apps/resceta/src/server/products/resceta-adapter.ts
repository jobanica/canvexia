import "server-only";
import { registerProductAdapter, type ProductAdapter, type ProvisionInput } from "@servd/core";
import { provisionPharmacy } from "@/server/pharmacy/provision";

/**
 * Resceta, as a CANVEXIA product.
 *
 * The only place that knows a CANVEXIA "merchant" is a Resceta "pharmacy".
 * Everything above it deals in merchants; everything below it deals in
 * pharmacies.
 *
 * Shorter than Servd's adapter, and the difference is the whole argument for
 * D24. Servd's has to wrap a creation path that predates CANVEXIA and thread
 * ownership through it. This one has nothing to thread: `partnerId` is a column
 * on `pharmacies` that existed before the first row, so provisioning is just
 * creating the row.
 *
 * `extra` carries the three licence numbers. They are deliberately NOT on
 * ProvisionInput: an FDA Licence to Operate is meaningless to a restaurant or a
 * laundry, and every field added to the shared shape is a field the portal must
 * render for every vertical.
 */
export const rescetaAdapter: ProductAdapter = {
  productId: "pharmacy",

  async provisionMerchant(input: ProvisionInput) {
    const extra = input.extra ?? {};
    const pharmacy = await provisionPharmacy({
      partnerId: input.partnerId,
      name: input.name,
      address: input.address,
      phone: input.phone,
      logoUrl: input.logoUrl,
      tagline: input.tagline,
      fdaLtoNumber: asString(extra.fdaLtoNumber),
      prcLicenseNo: asString(extra.prcLicenseNo),
      tin: asString(extra.tin),
    });

    // The slug this returns is the one that was written, read back from the
    // create rather than recomputed — uniqueness is settled inside
    // provisionPharmacy and guessing it here would eventually disagree.
    return { merchantId: pharmacy.id, slug: pharmacy.slug };
  },
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

registerProductAdapter(rescetaAdapter);
