import { PRODUCTS, isProductId, type ProductId } from "./registry";

/**
 * How a partner creates a merchant in any product.
 *
 * THE REQUIREMENT THIS EXISTS FOR: adding a vertical must not mean editing the
 * partner portal. Today the portal calls Servd's own restaurant-creation
 * function directly, so "add laundry" means "edit the portal, and the portal now
 * knows about laundry". Two verticals in and every new product is a change to
 * shared code that the other products have to be re-tested against.
 *
 * So the portal collects what is true of ANY merchant — a name, a contact, a
 * logo — hands it here with a product id, and knows nothing else. Each vertical
 * registers an adapter that turns that into whatever its own schema needs.
 */

/**
 * What the portal can collect without knowing which product it is for.
 *
 * Deliberately small. Every field here is a field the portal must render for
 * every vertical, so each addition is a tax on all of them — and a field that is
 * meaningless for laundry does not belong on the form a laundry operator fills
 * in. Anything product-specific goes in `extra`, which only that product's
 * adapter reads.
 */
export interface ProvisionInput {
  /** The partner who will own this merchant. */
  partnerId: string;
  /** Trading name. The one field no vertical can do without. */
  name: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  tagline?: string;
  /**
   * Product-specific fields, opaque to the portal and to this module.
   *
   * An escape hatch with a deliberate cost: anything in here cannot be collected
   * by the generic form, so a product that needs it has to provide its own step.
   * That friction is the point — it keeps the shared shape from accumulating
   * every vertical's quirks.
   */
  extra?: Record<string, unknown>;
}

export interface ProvisionResult {
  /** The new tenant's id WITHIN that product. Not globally unique across products. */
  merchantId: string;
  /** URL-safe identifier the product assigned. */
  slug: string;
}

export interface ProductAdapter {
  productId: ProductId;
  /**
   * Create a merchant owned by `input.partnerId`.
   *
   * Must set ownership itself. The dispatch cannot do it: only the adapter knows
   * where its product records an owner, and a merchant created without one is
   * invisible to its partner and absent from every statement.
   */
  provisionMerchant(input: ProvisionInput): Promise<ProvisionResult>;
}

/**
 * Registered adapters, populated by each app at startup.
 *
 * A registry rather than an import, because the dependency has to point this way:
 * core cannot import Servd without core depending on a Next app and a Prisma
 * schema. The vertical knows about core; core knows only that something claimed
 * a product id.
 */
const adapters = new Map<ProductId, ProductAdapter>();

export function registerProductAdapter(adapter: ProductAdapter): void {
  adapters.set(adapter.productId, adapter);
}

export function getProductAdapter(productId: string): ProductAdapter | null {
  if (!isProductId(productId)) return null;
  return adapters.get(productId) ?? null;
}

/** Which products can actually take a merchant right now. */
export function provisionableProducts(): ProductId[] {
  return (Object.keys(PRODUCTS) as ProductId[]).filter(
    (id) => PRODUCTS[id].live && adapters.has(id),
  );
}

export type ProvisionFailure =
  | "unknown_product"
  | "product_not_live"
  | "no_adapter"
  | "invalid_input";

export type ProvisionOutcome =
  | { ok: true; result: ProvisionResult }
  | { ok: false; reason: ProvisionFailure; message: string };

/**
 * Create a merchant in one product, on behalf of one partner.
 *
 * Returns a reason rather than throwing, because all four failures are things a
 * person can act on and two of them are ordinary states rather than faults: a
 * product that is listed but not yet live, and one whose adapter has not been
 * registered in this deployment.
 *
 * `product_not_live` is checked BEFORE `no_adapter` on purpose. A product with
 * no adapter is a deployment problem; a product that is not live is a product that
 * does not exist yet for anyone, and that is the more useful thing to be told.
 */
export async function provisionMerchant(
  productId: string,
  partnerId: string,
  payload: Omit<ProvisionInput, "partnerId">,
): Promise<ProvisionOutcome> {
  if (!isProductId(productId)) {
    return { ok: false, reason: "unknown_product", message: `No such product: ${productId}.` };
  }
  if (!PRODUCTS[productId].live) {
    return {
      ok: false,
      reason: "product_not_live",
      message: `${PRODUCTS[productId].name} isn't taking merchants yet.`,
    };
  }
  const adapter = adapters.get(productId);
  if (!adapter) {
    return {
      ok: false,
      reason: "no_adapter",
      message: `${PRODUCTS[productId].name} is not available in this deployment.`,
    };
  }
  if (!partnerId || !payload.name?.trim()) {
    return { ok: false, reason: "invalid_input", message: "A partner and a name are required." };
  }

  const result = await adapter.provisionMerchant({
    ...payload,
    name: payload.name.trim(),
    partnerId,
  });
  return { ok: true, result };
}

/** Test seam: empty the registry. */
export function __clearProductAdapters(): void {
  adapters.clear();
}
