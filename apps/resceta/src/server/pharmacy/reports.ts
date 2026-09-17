import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { enumerateDays, manilaDayIso, type DateRange } from "@/lib/pharmacy/range";

/**
 * The numbers an owner opens the app to see.
 *
 * MARGIN COMES FROM THE SALE LINE, NEVER THE BATCH.
 *
 * `unitCostCentavos` is snapshotted onto the line when the sale is rung up, so
 * a delivery that arrives cheaper next week does not retroactively improve last
 * week's profit. Reading the batch's current cost here would make every past
 * month move every time stock is received — a report that changes its own
 * history is worse than no report.
 *
 * A VOIDED SALE IS NOT REVENUE. Every query below filters `status: completed`;
 * the void put the stock back and the money never existed.
 */

export interface SalesReport {
  revenueCentavos: number;
  /** Selling price less the cost snapshotted at the time of sale. */
  profitCentavos: number;
  /** Profit as a percentage of revenue. Zero revenue is 0%, not NaN. */
  marginPct: number;
  transactions: number;
  itemsSold: number;
  /** One point per Manila day in the range, holes filled with zero. */
  series: { iso: string; revenueCentavos: number; count: number }[];
  topProducts: { name: string; qty: number; totalCentavos: number }[];
  /** How much of the takings was handed over VAT-exempt (SC/PWD). */
  vatExemptCentavos: number;
  discountCentavos: number;
}

export async function salesReport(pharmacyId: string, range: DateRange): Promise<SalesReport> {
  const [sales, items] = await Promise.all([
    pharmacyDb(pharmacyId, (tx) =>
      tx.pharmacySale.findMany({
        where: { status: "completed", createdAt: { gte: range.start, lt: range.end } },
        select: {
          totalCentavos: true,
          discountCentavos: true,
          vatExemptCentavos: true,
          createdAt: true,
        },
      }),
    ),
    pharmacyDb(pharmacyId, (tx) =>
      tx.pharmacySaleItem.findMany({
        // Through the sale, so a line belonging to a voided receipt is excluded
        // by the same rule that excludes the receipt.
        where: { sale: { status: "completed", createdAt: { gte: range.start, lt: range.end } } },
        select: {
          nameAtTime: true,
          quantity: true,
          lineTotalCentavos: true,
          unitCostCentavos: true,
        },
      }),
    ),
  ]);

  const revenueCentavos = sales.reduce((s, r) => s + r.totalCentavos, 0);
  const profitCentavos = items.reduce(
    (s, r) => s + (r.lineTotalCentavos - r.unitCostCentavos * r.quantity),
    0,
  );

  const revByDay = new Map<string, { revenueCentavos: number; count: number }>();
  for (const s of sales) {
    const iso = manilaDayIso(s.createdAt);
    const cur = revByDay.get(iso) ?? { revenueCentavos: 0, count: 0 };
    cur.revenueCentavos += s.totalCentavos;
    cur.count += 1;
    revByDay.set(iso, cur);
  }

  const byProduct = new Map<string, { qty: number; totalCentavos: number }>();
  for (const it of items) {
    const cur = byProduct.get(it.nameAtTime) ?? { qty: 0, totalCentavos: 0 };
    cur.qty += it.quantity;
    cur.totalCentavos += it.lineTotalCentavos;
    byProduct.set(it.nameAtTime, cur);
  }

  return {
    revenueCentavos,
    profitCentavos,
    // Guarded: a range with no sales must read 0%, and `0/0` is NaN, which
    // renders as the string "NaN%" on the first screen of an empty pharmacy.
    marginPct: revenueCentavos > 0 ? (profitCentavos / revenueCentavos) * 100 : 0,
    transactions: sales.length,
    itemsSold: items.reduce((s, r) => s + r.quantity, 0),
    series: enumerateDays(range).map((iso) => ({
      iso,
      revenueCentavos: revByDay.get(iso)?.revenueCentavos ?? 0,
      count: revByDay.get(iso)?.count ?? 0,
    })),
    topProducts: [...byProduct.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.totalCentavos - a.totalCentavos)
      .slice(0, 5),
    vatExemptCentavos: sales.reduce((s, r) => s + r.vatExemptCentavos, 0),
    discountCentavos: sales.reduce((s, r) => s + r.discountCentavos, 0),
  };
}

export interface Valuation {
  /** What the stock on the shelf cost to buy. */
  atCostCentavos: number;
  /** What it would fetch at today's shelf prices. */
  atRetailCentavos: number;
  /** Retail less cost — the profit still sitting on the shelf. */
  potentialProfitCentavos: number;
  /** Units on hand, and how many of those are already expired. */
  units: number;
  expiredUnits: number;
  expiredValueCentavos: number;
}

/**
 * What is on the shelf right now, at cost and at retail.
 *
 * NOT DATE-RANGED, deliberately: "inventory value over the last 30 days" is not
 * a question anybody asks. It is a snapshot, and it is the number an owner
 * checks against the shelf.
 *
 * EXPIRED STOCK IS COUNTED AND FLAGGED, not silently dropped. It is money that
 * was spent and is sitting there — hiding it makes the valuation agree with the
 * shelf and disagree with the bank. The expired portion is broken out so the
 * loss is visible rather than blended in.
 */
export async function inventoryValuation(
  pharmacyId: string,
  asOf: Date = new Date(),
): Promise<Valuation> {
  const batches = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyBatch.findMany({
      where: { quantity: { gt: 0 } },
      select: {
        quantity: true,
        costCentavos: true,
        expiryDate: true,
        product: { select: { priceCentavos: true } },
      },
    }),
  );

  let atCostCentavos = 0;
  let atRetailCentavos = 0;
  let units = 0;
  let expiredUnits = 0;
  let expiredValueCentavos = 0;

  for (const b of batches) {
    const cost = b.quantity * b.costCentavos;
    atCostCentavos += cost;
    atRetailCentavos += b.quantity * (b.product?.priceCentavos ?? 0);
    units += b.quantity;
    if (b.expiryDate && b.expiryDate.getTime() < asOf.getTime()) {
      expiredUnits += b.quantity;
      expiredValueCentavos += cost;
    }
  }

  return {
    atCostCentavos,
    atRetailCentavos,
    potentialProfitCentavos: atRetailCentavos - atCostCentavos,
    units,
    expiredUnits,
    expiredValueCentavos,
  };
}
