/**
 * The merchant axes — one per product.
 *
 * A merchant is a tenant of exactly one product, and each product records its
 * merchants in its own table: Servd in `restaurants`, Reseta in `pharmacies`.
 * That is not incidental, it is what `ProvisionResult.merchantId` already says —
 * "the new tenant's id WITHIN that product. Not globally unique across
 * products." One shared merchants table was the alternative and would have meant
 * either a column soup of every product's fields or a Json blob nobody can
 * query; a pharmacy needs an FDA licence number and a restaurant needs a
 * printer config, and neither belongs on the other.
 *
 * What every axis MUST share, because the platform is built on it:
 *
 *   1. a `partnerId` column on the merchant table — the ownership axis, same
 *      name and same meaning everywhere, so one partner arm works for all;
 *   2. a foreign-key column on every tenant table pointing at it;
 *   3. a GUC carrying the current merchant id.
 *
 * Written down here, once, because these three strings must agree across
 * rls.sql, the policies, and the scoped-db wrappers — and a mismatch does not
 * raise an error. `current_setting(..., true)` returns NULL for a name nobody
 * set, the policy matches no rows, and the symptom is an empty screen a long
 * way from the cause. The same reasoning as GUC in ./guc.ts, one level up.
 *
 * ADDING A PRODUCT means adding an entry here and the matching array literal in
 * packages/db/prisma/rls.sql. There are deliberately two copies: SQL cannot
 * import TypeScript, and a test asserts they agree
 * (tests/isolation/merchant-axes.test.ts) so the duplication cannot drift
 * silently.
 */

export interface MerchantAxis {
  /** The product this axis belongs to; matches a key of PRODUCTS. */
  productId: string;
  /** The table holding merchants of that product. Carries `partnerId`. */
  table: string;
  /** The column every tenant table of that product carries. */
  column: string;
  /** The Postgres session setting carrying the current merchant id. */
  guc: string;
}

export const MERCHANT_AXES = {
  servd: {
    productId: "servd",
    table: "restaurants",
    column: "restaurantId",
    guc: "app.current_restaurant_id",
  },
  pharmacy: {
    productId: "pharmacy",
    table: "pharmacies",
    column: "pharmacyId",
    guc: "app.current_pharmacy_id",
  },
} as const satisfies Record<string, MerchantAxis>;

export type MerchantAxisId = keyof typeof MERCHANT_AXES;

export function merchantAxis(productId: string): MerchantAxis | null {
  return Object.prototype.hasOwnProperty.call(MERCHANT_AXES, productId)
    ? MERCHANT_AXES[productId as MerchantAxisId]
    : null;
}

export function merchantAxes(): MerchantAxis[] {
  return Object.values(MERCHANT_AXES);
}
