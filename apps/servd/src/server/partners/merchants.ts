import "server-only";
import { PRODUCTS, type ProductId } from "@servd/core";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";

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
 * BOTH AXES BILL NOW. `subscriptions` carries `productId`, so a pharmacy's plan
 * is read here the same way a restaurant's is — through a second query rather
 * than a relation, because `subscriptions.restaurantId` holds a pharmacies.id
 * for those rows and that is a join Prisma cannot express.
 *
 * This comment used to say the pharmacy vertical had no billing and that
 * `plan: null` was an honest gap. It stopped being either the day Resceta got
 * a ₱999 plan, and the merchant page went on reporting "Not billed yet" and
 * "Not paying yet, so it is not earning either of you anything" about a shop
 * that was earning its partner ₱699 a month.
 *
 * Null survives for a merchant with no subscription row at all — a pharmacy
 * provisioned before billing existed. Null renders as "not billed yet", which
 * is true of it; zero would look like a price and would understate a partner's
 * MRR as a number rather than a gap.
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
  /**
   * Can anybody actually sign in to this account?
   *
   * `false` is the state a partner-opened merchant starts in and the one nobody
   * could see: `provisionMerchant` creates the tenant, the storefront and the
   * complimentary trial, and deliberately NO login — the owner has not agreed
   * to anything yet. Converting it is what mints the credential.
   *
   * `null` means "not asked or not applicable": a pharmacy, which has no
   * convert flow, or a database where the read failed. Null is deliberately not
   * `false` — telling somebody an account has no login when it has one sends
   * them to a form that then refuses.
   */
  hasLogin: boolean | null;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/**
 * Which of these accounts can actually be signed into.
 *
 * A SEPARATE READ, after the scoped transaction rather than inside it: the ids
 * are already partner-scoped by the policy that produced them, and `staffUser`
 * is a merchant's own table rather than a partner's.
 *
 * Excludes the temporary PREVIEW login, which is a sales tool issued to demo a
 * storefront to the very prospect being pitched — counting it would report an
 * account as signed-in-able and hide the convert form that turns it into one.
 * Same rule as `countRealLogins` in storefront-demo/convert.ts, including its
 * fallback: `previewExpiresAt` arrives in a manual migration, and where the
 * column does not exist no preview login can either.
 */
async function withLoginState(rows: PartnerMerchant[]): Promise<PartnerMerchant[]> {
  const ids = rows.filter((r) => r.productId === "servd").map((r) => r.id);
  if (ids.length === 0) return rows;

  let hasLoginIds: Set<string>;
  try {
    const staff = await systemDb((tx) =>
      tx.staffUser
        .findMany({
          where: { restaurantId: { in: ids }, previewExpiresAt: null },
          select: { restaurantId: true },
        })
        .catch(() =>
          tx.staffUser.findMany({
            where: { restaurantId: { in: ids } },
            select: { restaurantId: true },
          }),
        ),
    );
    hasLoginIds = new Set(staff.map((s) => s.restaurantId));
  } catch {
    // Left as null — "we could not tell" — rather than false. The convert
    // action re-checks and refuses an account that already has a login, so an
    // offered form is recoverable; a wrong "no login" chip is a lie on a list.
    return rows;
  }

  return rows.map((r) =>
    r.productId === "servd" ? { ...r, hasLogin: hasLoginIds.has(r.id) } : r,
  );
}

export async function listPartnerMerchants(partnerId: string): Promise<PartnerMerchant[]> {
  const since = new Date(Date.now() - THIRTY_DAYS);

  const rows = await partnerDb(partnerId, async (tx) => {
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

    /**
     * THE PHARMACIES' PLANS.
     *
     * A separate query rather than a relation, because there is no relation to
     * follow: `subscriptions.restaurantId` means "the merchant id within
     * productId", and for a pharmacy row that id is a pharmacies.id — a join
     * Prisma cannot express and the database no longer enforces. See
     * billing-by-product.sql.
     *
     * ONE QUERY FOR ALL OF THEM, then matched in memory. The alternative is one
     * per pharmacy, which is the shape that turns a list into a timeout.
     *
     * Until this existed the three billing fields below were hard-coded null
     * with a comment saying the pharmacy vertical did not bill yet. It does
     * now, so the merchant page read "Not billed yet", "—" and "Not paying yet,
     * so it is not earning either of you anything" about a shop on ₱999 that
     * was earning them ₱699 a month.
     */
    const pharmacyIds = pharmacies.map((p) => p.id);
    const pharmacySubs = pharmacyIds.length
      ? await tx.subscription
          .findMany({
            where: { productId: "pharmacy", restaurantId: { in: pharmacyIds } },
            orderBy: { createdAt: "desc" },
            select: {
              restaurantId: true,
              status: true,
              trialEndsAt: true,
              plan: { select: { name: true, priceMonthly: true } },
            },
          })
          .catch(() => [])
      : [];
    // First wins, and the order above is newest first — the current
    // subscription is the latest row, same rule the rest of billing uses.
    const subFor = new Map<string, (typeof pharmacySubs)[number]>();
    for (const sub of pharmacySubs) {
      if (!subFor.has(sub.restaurantId)) subFor.set(sub.restaurantId, sub);
    }

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
          // Filled in after this transaction — see `withLoginState`.
          hasLogin: null,
        };
      }),
      ...pharmacies.map((p) => {
        const sub = subFor.get(p.id);
        return {
        key: `pharmacy:${p.id}`,
        id: p.id,
        productId: "pharmacy" as ProductId,
        productName: PRODUCTS.pharmacy.name,
        name: p.name,
        slug: p.slug,
        status: String(p.status),
        city: p.address ?? null,
        // Null, not zero, when there is no subscription row: a 0 here would
        // look like a price. A pharmacy provisioned before billing existed is
        // the only case, and "Not billed yet" is true of it.
        planName: sub?.plan.name ?? null,
        priceMonthly: sub?.plan.priceMonthly ?? null,
        subscriptionStatus: (sub?.status ?? null) as PartnerMerchant["subscriptionStatus"],
        trialEndsAt: sub?.trialEndsAt ?? null,
        ordersLast30d: 0,
        lastOrderAt: null,
        createdAt: p.createdAt,
        // The pharmacy vertical has no convert flow, so the question does not
        // apply rather than answering "no".
        hasLogin: null,
        };
      }),
    ];

    return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });

  return withLoginState(rows);
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
 * Who signed this merchant and who supports it (A7).
 *
 * A separate read rather than columns on `PartnerMerchant`: the list screen
 * shows dozens of merchants and would pay for two joins per row to render a
 * name nobody reads there. The detail screen asks for one.
 *
 * A deactivated seat still answers — the person who signed it is a historical
 * fact, and blanking them the day they leave loses the one thing the column is
 * for.
 *
 * IT RETURNS A WAY TO REACH THEM, not just a name.
 *
 * REPORTED — "so partner can see who activated it and if have problem, knows
 * who to call." A name alone answers the first half and not the second: an
 * operator reading "Signed by Juan" at 8pm with a broken till still has to go
 * and look Juan up. The mobile is on the seat's own staff record already.
 */
export interface Assignee {
  name: string;
  email: string;
  mobile: string | null;
  /** False once they have been deactivated — still shown, with a note. */
  active: boolean;
}

export async function merchantAssignees(
  partnerId: string,
  productId: string,
  merchantId: string,
): Promise<{ signedBy: Assignee | null; supportedBy: Assignee | null }> {
  try {
    const row = await systemDb(async (tx: any) => {
      const person = { select: { name: true, email: true, mobile: true, status: true } };
      const select = { assignedSales: person, assignedSupport: person };
      return productId === "pharmacy"
        ? tx.pharmacy.findFirst({ where: { id: merchantId, partnerId }, select })
        : tx.restaurant.findFirst({ where: { id: merchantId, partnerId }, select });
    });
    const shape = (
      u: { name: string | null; email: string; mobile: string | null; status: string } | null | undefined,
    ): Assignee | null =>
      u
        ? {
            name: u.name ?? u.email,
            email: u.email,
            mobile: u.mobile?.trim() || null,
            active: u.status === "active",
          }
        : null;
    return {
      signedBy: shape(row?.assignedSales),
      supportedBy: shape(row?.assignedSupport),
    };
  } catch {
    // The assignment columns are not migrated yet. Null reads as "nobody", which
    // is true of every merchant that existed before A7.
    return { signedBy: null, supportedBy: null };
  }
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
