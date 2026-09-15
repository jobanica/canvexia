import "server-only";
import { PRODUCTS, type ProductId } from "@servd/core";
import { partnerDb } from "@/server/tenancy/scoped-db";

/**
 * A partner's merchants, across every product.
 *
 * A FAN-OUT, NOT A JOIN, and that is forced rather than chosen. Each product has
 * its own merchant table (D29) and a merchant id is unique only WITHIN a product
 * — the same reason PartnerLedgerEntry carries productId beside merchantId.
 * There is no single table to select from, so this queries each axis and merges.
 *
 * Reads through partnerDb(), never systemDb(): the policy is what scopes these
 * rows, so a missing `where` clause returns nothing instead of everything.
 *
 * ONE HONEST GAP. Only restaurants have subscriptions — `Subscription` keys on
 * restaurantId, and the pharmacy vertical has no billing yet. A pharmacy
 * therefore reports `plan: null`, which the UI renders as "not billed yet"
 * rather than as ₱0. Showing zero would quietly understate a partner's MRR and
 * look like a number rather than a gap.
 */
export interface PartnerMerchant {
  /** `${productId}:${id}` — unique across products, which the bare id is not. */
  key: string;
  id: string;
  productId: ProductId;
  productName: string;
  name: string;
  slug: string;
  status: string;
  city: string | null;
  planName: string | null;
  /** Centavos per month, or null where the product does not bill yet. */
  priceMonthly: number | null;
  subscriptionStatus: "trialing" | "active" | "past_due" | "cancelled" | null;
  trialEndsAt: Date | null;
  ordersLast30d: number;
  lastOrderAt: Date | null;
  createdAt: Date;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function listPartnerMerchants(partnerId: string): Promise<PartnerMerchant[]> {
  const since = new Date(Date.now() - THIRTY_DAYS);

  return partnerDb(partnerId, async (tx) => {
    // The two axes are independent, so they are asked together. Awaiting the
    // pharmacy list after the restaurant list added a round trip for nothing.
    const [restaurants, pharmacies] = await Promise.all([
      tx.restaurant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          businessAddress: true,
          createdAt: true,
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              status: true,
              trialEndsAt: true,
              plan: { select: { name: true, priceMonthly: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      tx.pharmacy.findMany({
        select: { id: true, name: true, slug: true, status: true, address: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Counted per merchant rather than per row: groupBy keeps this one query
    // instead of one per restaurant, which on a partner with fifty shops is the
    // difference between a page and a timeout.
    const ids = restaurants.map((r) => r.id);
    const [recent, latest] = ids.length
      ? await Promise.all([
          tx.order.groupBy({
            by: ["restaurantId"],
            where: { restaurantId: { in: ids }, createdAt: { gte: since } },
            _count: { _all: true },
          }),
          tx.order.groupBy({
            by: ["restaurantId"],
            where: { restaurantId: { in: ids } },
            _max: { createdAt: true },
          }),
        ])
      : [[], []];

    const countBy = new Map(recent.map((r) => [r.restaurantId, r._count._all]));
    const lastBy = new Map(latest.map((r) => [r.restaurantId, r._max.createdAt]));

    const rows: PartnerMerchant[] = [
      ...restaurants.map((r) => {
        const sub = r.subscriptions[0];
        return {
          key: `servd:${r.id}`,
          id: r.id,
          productId: "servd" as ProductId,
          productName: PRODUCTS.servd.name,
          name: r.name,
          slug: r.slug,
          status: String(r.status),
          city: r.businessAddress ?? null,
          planName: sub?.plan.name ?? null,
          priceMonthly: sub?.plan.priceMonthly ?? null,
          subscriptionStatus: (sub?.status ?? null) as PartnerMerchant["subscriptionStatus"],
          trialEndsAt: sub?.trialEndsAt ?? null,
          ordersLast30d: countBy.get(r.id) ?? 0,
          lastOrderAt: lastBy.get(r.id) ?? null,
          createdAt: r.createdAt,
        };
      }),
      ...pharmacies.map((p) => ({
        key: `pharmacy:${p.id}`,
        id: p.id,
        productId: "pharmacy" as ProductId,
        productName: PRODUCTS.pharmacy.name,
        name: p.name,
        slug: p.slug,
        status: String(p.status),
        city: p.address ?? null,
        // Not zero — see the note at the top. The pharmacy vertical does not
        // bill yet, and a 0 here would look like a price.
        planName: null,
        priceMonthly: null,
        subscriptionStatus: null,
        trialEndsAt: null,
        ordersLast30d: 0,
        lastOrderAt: null,
        createdAt: p.createdAt,
      })),
    ];

    return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });
}

/** One merchant, by the composite key the directory hands out. */
export async function getPartnerMerchant(
  partnerId: string,
  key: string,
): Promise<PartnerMerchant | null> {
  const all = await listPartnerMerchants(partnerId);
  return all.find((m) => m.key === key) ?? null;
}

/**
 * What a merchant is worth per month, and whether it counts as paying.
 *
 * "Active paying" is `status === "active"` with a price — a trial is not
 * revenue, and this is the number a milestone is measured against. Getting it
 * wrong in the generous direction tells a partner they have hit a target they
 * have not.
 */
export function isPaying(m: PartnerMerchant): boolean {
  return m.subscriptionStatus === "active" && (m.priceMonthly ?? 0) > 0;
}

export function mrrCentavos(merchants: readonly PartnerMerchant[]): number {
  return merchants.reduce((sum, m) => (isPaying(m) ? sum + (m.priceMonthly ?? 0) : sum), 0);
}
