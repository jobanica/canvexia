/**
 * The CANVEXIA product catalogue.
 *
 * A partner is enabled for some set of these; a merchant is a tenant of exactly
 * one. The registry exists so the partner portal can list products, and later
 * provision into them, without importing anything from a vertical — adding the
 * laundry app must not mean editing the portal.
 *
 * `live` is the honest field here. Servd is the only product with paying
 * customers. Reseta (pharmacy) is built — schema, policies, adapter, POS — and
 * is held at false for one reason stated on its entry. The other two are empty
 * repositories (D28). Listing them as entries with
 * live:false is not aspiration, it is what stops the portal from offering a
 * merchant account in a product that cannot yet create one.
 */

export interface ProductDefinition {
  id: string;
  /** Shown to partners and merchants. */
  name: string;
  /** One line for the product picker. */
  description: string;
  /** Whether merchants can actually be provisioned into it today. */
  live: boolean;
}

export const PRODUCTS = {
  servd: {
    id: "servd",
    name: "Servd",
    description: "Restaurant ordering, QR dine-in, delivery and store mode.",
    live: true,
  },
  printosph: {
    id: "printosph",
    name: "PrintOSph",
    description: "Print shop orders, quoting and job tracking.",
    // jobanica/print-new is an EMPTY repository — checked, not assumed. The
    // brief describes it as "fully specced (22-phase build, 33-table schema)";
    // whatever that refers to is not in that repo. Same for jobanica/laundry.
    // See D28.
    live: false,
  },
  laundry: {
    id: "laundry",
    name: "Laundry",
    description: "Pickup and delivery laundry with subscriptions and rider ops.",
    live: false,
  },
  pharmacy: {
    id: "pharmacy",
    name: "Reseta",
    description: "Pharmacy POS, batch inventory, expiry tracking and SC/PWD compliance.",
    // STILL FALSE, and the gate is one specific thing.
    //
    // The tables exist, the policies hold (proved against the live CANVEXIA
    // database: a partner reading `pharmacy_batches` with no where clause sees
    // only its own, and fetching another partner's batch BY PRIMARY KEY returns
    // nothing), and the adapter is registered and unit-tested. What has NOT
    // happened is `provisionPharmacy()` itself running against a real database —
    // this session has no DATABASE_URL, and the isolation suite that would prove
    // it skips without one.
    //
    // adding-a-vertical.md says to flip this only after provisioning has been
    // run for real, and the rule is not ceremony: `live: true` makes the partner
    // portal offer pharmacy accounts, so an adapter bug that only shows against
    // a database becomes a merchant with an account they cannot use, discovered
    // by them. One command closes it — see docs/canvexia/reseta.md.
    live: false,
  },
} as const satisfies Record<string, ProductDefinition>;

export type ProductId = keyof typeof PRODUCTS;

export function isProductId(value: string): value is ProductId {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, value);
}

/** Products a merchant can be created in right now. */
export function liveProducts(): ProductDefinition[] {
  return Object.values(PRODUCTS).filter((p) => p.live);
}
