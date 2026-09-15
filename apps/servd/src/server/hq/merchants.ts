import "server-only";
import { PRODUCTS, type ProductId } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { toCsv } from "@/lib/hq/csv";

/**
 * Every merchant on the platform, across every product and partner.
 *
 * A FAN-OUT, NOT A JOIN, for the same reason the partner portal's own list is
 * one: each product has its own merchant table (D29) and a merchant id is
 * unique only WITHIN a product. There is no single table to select from.
 *
 * This is a SECOND directory alongside `server/partners/directory.ts`, which is
 * restaurant-only and feeds the reassign form. That one is not extended in
 * place because it answers a narrower question with a narrower shape — merging
 * them would mean the reassign form suddenly offers pharmacies, which cannot be
 * reassigned: `reassignMerchant` writes `restaurants.partnerId`, and the
 * pharmacy axis has no equivalent path yet. H4 states that gap rather than
 * papering over it with a button that half works.
 */

export interface HqMerchantRow {
  /** `${productId}:${id}` — unique across products, which the bare id is not. */
  key: string;
  id: string;
  productId: ProductId;
  productName: string;
  name: string;
  slug: string;
  status: string;
  city: string | null;
  partnerId: string | null;
  partnerName: string | null;
  isHouse: boolean;
  referralPartnerName: string | null;
  planName: string | null;
  priceMonthly: number | null;
  subscriptionStatus: string | null;
  ordersLast30d: number;
  lastActivityAt: Date | null;
  createdAt: Date;
  /** Whether anyone can sign in — a demo storefront has no staff. */
  live: boolean;
  /** Whether HQ can move this one. Only the Servd axis can be reassigned. */
  reassignable: boolean;
}

export interface HqMerchantFilter {
  partnerId?: string;
  productId?: string;
  status?: string;
  q?: string;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function listAllMerchants(f: HqMerchantFilter = {}): Promise<{
  rows: HqMerchantRow[];
  partners: { id: string; name: string; isHouse: boolean; status: string }[];
  unassigned: number;
  house: { id: string; name: string } | null;
}> {
  const since = new Date(Date.now() - THIRTY_DAYS);

  return systemDb(async (tx) => {
    const [partners, restaurants, pharmacies] = await Promise.all([
      tx.partner.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, isHouse: true, status: true, referralPartnerId: true },
      }),
      tx.restaurant.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          businessAddress: true,
          partnerId: true,
          createdAt: true,
          plan: { select: { name: true, priceMonthly: true } },
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true, plan: { select: { name: true, priceMonthly: true } } },
          },
          _count: { select: { staff: true } },
        },
      }),
      tx.pharmacy.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          status: true,
          address: true,
          partnerId: true,
          createdAt: true,
        },
      }),
    ]);

    const byId = new Map(partners.map((p) => [p.id, p]));
    const ids = restaurants.map((r) => r.id);

    const [recent, latest] = ids.length
      ? await Promise.all([
          // groupBy, not one query per merchant: on a platform with a few
          // hundred shops the difference is a page and a timeout.
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

    const rows: HqMerchantRow[] = [
      ...restaurants.map((r) => {
        const owner = r.partnerId ? byId.get(r.partnerId) : null;
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
          partnerId: r.partnerId,
          partnerName: owner?.name ?? null,
          isHouse: owner?.isHouse ?? false,
          referralPartnerName: owner?.referralPartnerId
            ? (byId.get(owner.referralPartnerId)?.name ?? null)
            : null,
          planName: sub?.plan?.name ?? r.plan?.name ?? null,
          priceMonthly: sub?.plan?.priceMonthly ?? r.plan?.priceMonthly ?? null,
          subscriptionStatus: sub?.status ?? null,
          ordersLast30d: countBy.get(r.id) ?? 0,
          lastActivityAt: lastBy.get(r.id) ?? null,
          createdAt: r.createdAt,
          live: r._count.staff > 0,
          reassignable: true,
        };
      }),
      ...pharmacies.map((p) => {
        const owner = p.partnerId ? byId.get(p.partnerId) : null;
        return {
          key: `pharmacy:${p.id}`,
          id: p.id,
          productId: "pharmacy" as ProductId,
          productName: PRODUCTS.pharmacy.name,
          name: p.displayName || p.name,
          slug: p.slug,
          status: String(p.status),
          city: p.address ?? null,
          partnerId: p.partnerId,
          partnerName: owner?.name ?? null,
          isHouse: owner?.isHouse ?? false,
          referralPartnerName: owner?.referralPartnerId
            ? (byId.get(owner.referralPartnerId)?.name ?? null)
            : null,
          // Not zero — Resceta has no billing yet, and a 0 here would look like
          // a price rather than a gap.
          planName: null,
          priceMonthly: null,
          subscriptionStatus: null,
          ordersLast30d: 0,
          lastActivityAt: null,
          createdAt: p.createdAt,
          live: p.status === "active",
          // reassignMerchant writes restaurants.partnerId. The pharmacy axis
          // has no equivalent path, so the button is absent rather than
          // present and broken.
          reassignable: false,
        };
      }),
    ];

    const q = f.q?.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (f.partnerId === "__unassigned__" ? r.partnerId !== null : f.partnerId && r.partnerId !== f.partnerId) {
        return false;
      }
      if (f.productId && r.productId !== f.productId) return false;
      if (f.status && r.status !== f.status) return false;
      if (q && !`${r.name} ${r.slug} ${r.city ?? ""} ${r.partnerName ?? ""}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      rows: filtered,
      partners: partners.map(({ id, name, isHouse, status }) => ({ id, name, isHouse, status })),
      // A merchant with a null partnerId belongs to nobody, is invisible to
      // every portal, and is absent from every statement. Anything above zero
      // is a merchant nobody is being paid for.
      unassigned: rows.filter((r) => r.partnerId === null).length,
      house: partners.find((p) => p.isHouse) ?? null,
    };
  });
}

export async function exportMerchantsCsv(f: HqMerchantFilter = {}): Promise<string> {
  const { rows } = await listAllMerchants(f);
  return toCsv(
    ["key", "name", "product", "partner", "plan", "priceCentavos", "status", "subscription",
     "city", "ordersLast30d", "lastActivity", "created"],
    rows.map((r) => ({
      key: r.key,
      name: r.name,
      product: r.productName,
      partner: r.partnerName ?? "(unassigned)",
      plan: r.planName ?? "",
      // Centavos, and the header says so — exporting pesos invites somebody to
      // sum a column that has been rounded.
      priceCentavos: r.priceMonthly ?? "",
      status: r.status,
      subscription: r.subscriptionStatus ?? "",
      city: r.city ?? "",
      ordersLast30d: r.ordersLast30d,
      lastActivity: r.lastActivityAt?.toISOString() ?? "",
      created: r.createdAt.toISOString(),
    })),
  );
}
