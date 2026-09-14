/**
 * The CANVEXIA product catalogue.
 *
 * A partner is enabled for some set of these; a merchant is a tenant of exactly
 * one. The registry exists so the partner portal can list products, and later
 * provision into them, without importing anything from a vertical — adding the
 * laundry app must not mean editing the portal.
 *
 * `live` is the honest field here. Servd has the paying customers; Resceta is
 * built and provisionable but has none yet. The other two are entries for
 * products that do not exist — their repositories are empty (D28) — and
 * `live: false` is what stops the portal offering a merchant an account in
 * something that cannot create one. Listing them as entries with
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
    name: "Resceta",
    description: "Pharmacy POS, batch inventory, expiry tracking and SC/PWD compliance.",
    // Live as of the sign-in work. The gate `adding-a-vertical.md` sets is
    // three things, and all three are asserted against a real database by
    // apps/resceta/tests/isolation/provision.test.ts: the real adapter creates a
    // pharmacy owned by the right partner, that partner sees it through RLS
    // with NO where clause, and no other partner sees it — not even by primary
    // key. The same run dispenses FEFO across two batches and checks the stock
    // ledger explains the balance.
    live: true,
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
