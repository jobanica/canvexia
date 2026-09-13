/**
 * The CANVEXIA product catalogue.
 *
 * A partner is enabled for some set of these; a merchant is a tenant of exactly
 * one. The registry exists so the partner portal can list products, and later
 * provision into them, without importing anything from a vertical — adding the
 * laundry app must not mean editing the portal.
 *
 * `live` is the honest field here. Servd is the only product with paying
 * customers; the rest are separate repositories that have not been migrated onto
 * this core (see docs/canvexia/decisions.md, D6). Listing them as entries with
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
    name: "Pharmacy",
    description: "Pharmacy inventory, dispensing and compliance.",
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
