import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { branchWhere, type BranchContext } from "@/server/pharmacy/branches";
import { daysOfSupply, expiryBucket, suggestedOrder, type ExpiryBucket } from "@/lib/pharmacy/alerts";

/**
 * The four questions a pharmacist asks about stock.
 *
 *   What am I about to run out of?   → lowStock
 *   What is about to become illegal?  → expiringBatches
 *   What is my money sitting in?      → deadStock
 *   What will never sell through?     → slowMoving
 *
 * ON HAND EXCLUDES EXPIRED BATCHES EVERYWHERE, because an expired batch is not
 * stock — it is a write-off waiting to happen. Counting it would tell a
 * pharmacist they have 200 Amoxicillin when they have none they may dispense,
 * and the reorder that did not happen is the one that empties the shelf.
 */

export interface LowStockRow {
  productId: string;
  name: string;
  unit: string;
  onHand: number;
  reorderPoint: number;
  suggested: number;
}

export interface ExpiringRow {
  batchId: string;
  productId: string;
  productName: string;
  supplierName: string | null;
  lotNumber: string | null;
  expiryDate: Date;
  unit: string;
  quantity: number;
  valueCentavos: number;
  bucket: ExpiryBucket;
  days: number;
}

export interface DeadStockRow {
  productId: string;
  name: string;
  unit: string;
  onHand: number;
  lastSold: Date | null;
  valueCentavos: number;
}

export interface SlowMovingRow {
  productId: string;
  name: string;
  unit: string;
  onHand: number;
  sold: number;
  daysOfSupply: number | null;
  lastSold: Date | null;
  valueCentavos: number;
}

/**
 * Live stock per product, and what it cost.
 *
 * ONE QUERY FOR ALL FOUR REPORTS. Four separate passes over two thousand
 * products with their batches is four times the work for the same rows, and
 * this page shows all four counts in its tab bar before anybody clicks
 * anything.
 *
 * Value is the batch's OWN cost, not a current price: capital tied up is what
 * was paid for the stock sitting there, and two deliveries of the same drug at
 * different costs are two different amounts of money.
 */
async function shelf(pharmacyId: string, branch: BranchContext | undefined, asOf: Date) {
  const products = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyProduct.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        unit: true,
        reorderPoint: true,
        priceCentavos: true,
        batches: {
          where: { quantity: { gt: 0 }, ...(branch ? branchWhere(branch) : {}) },
          select: {
            id: true,
            lotNumber: true,
            expiryDate: true,
            quantity: true,
            costCentavos: true,
            supplier: { select: { name: true } },
          },
        },
      },
    }),
  );

  return products.map((p) => {
    const live = p.batches.filter(
      (b) => b.expiryDate === null || expiryBucket(b.expiryDate, asOf) !== "expired",
    );
    return {
      ...p,
      live,
      onHand: live.reduce((s, b) => s + b.quantity, 0),
      // Costed off the live batches only. Expired stock is counted by the
      // expiring report, and counting it twice would double the money.
      valueCentavos: live.reduce((s, b) => s + b.quantity * b.costCentavos, 0),
    };
  });
}

/** When each product last sold, and how much moved inside the window. */
async function movement(pharmacyId: string, since: Date, branch: BranchContext | undefined) {
  const [last, within] = await Promise.all([
    pharmacyDb(pharmacyId, (tx) =>
      tx.pharmacySaleItem.groupBy({
        by: ["productId"],
        where: { sale: { status: "completed", ...(branch ? branchWhere(branch) : {}) } },
        _max: { createdAt: true },
      }),
    ),
    pharmacyDb(pharmacyId, (tx) =>
      tx.pharmacySaleItem.groupBy({
        by: ["productId"],
        where: {
          createdAt: { gte: since },
          sale: { status: "completed", ...(branch ? branchWhere(branch) : {}) },
        },
        _sum: { quantity: true },
      }),
    ),
  ]);

  return {
    lastSold: new Map(last.map((r) => [r.productId, r._max.createdAt])),
    sold: new Map(within.map((r) => [r.productId, r._sum.quantity ?? 0])),
  };
}

export interface AlertsData {
  low: LowStockRow[];
  expiring: ExpiringRow[];
  dead: DeadStockRow[];
  slow: SlowMovingRow[];
  windowDays: number;
  deadDays: number;
  /**
   * Products a reorder point would catch, if one had been set. Reported rather
   * than silently excluded: after a CSV import almost every product has a
   * reorder point of 0, and a low-stock list that quietly ignores them is a
   * list that says "nothing to order" about a shop with empty shelves.
   */
  noReorderPoint: number;
}

/**
 * Everything the alerts screen shows, in one pass.
 *
 * `slowWindowDays` is 90 and deliberately NOT configurable: it is the
 * denominator of the days-of-supply figure, and a window somebody can change
 * is a figure that means something different on Tuesday.
 */
export async function alertsFor(
  pharmacyId: string,
  opts: {
    expiryWindowDays: number;
    deadStockDays: number;
    branch?: BranchContext;
    asOf?: Date;
  },
): Promise<AlertsData> {
  const asOf = opts.asOf ?? new Date();
  const SLOW_WINDOW = 90;
  const slowSince = new Date(asOf.getTime() - SLOW_WINDOW * 86_400_000);
  const deadBefore = new Date(asOf.getTime() - opts.deadStockDays * 86_400_000);

  const [stock, moved] = await Promise.all([
    shelf(pharmacyId, opts.branch, asOf),
    movement(pharmacyId, slowSince, opts.branch),
  ]);

  const low: LowStockRow[] = [];
  let noReorderPoint = 0;
  const expiring: ExpiringRow[] = [];
  const dead: DeadStockRow[] = [];
  const slow: SlowMovingRow[] = [];

  for (const p of stock) {
    if (p.reorderPoint === 0) noReorderPoint += 1;
    const lastSold = moved.lastSold.get(p.id) ?? null;
    const sold = moved.sold.get(p.id) ?? 0;

    /*
      ── LOW STOCK. At OR BELOW, not below: a product sitting exactly on its
      reorder point is the moment the reorder point was set to catch.

      OUT OF STOCK COUNTS EVEN WITH NO REORDER POINT. A product at zero is the
      most urgent row on this screen whether or not anybody configured a
      threshold for it — and after a CSV import the threshold is 0 on almost
      everything, so requiring one would have hidden every empty shelf in the
      pharmacy. They sort first, because `low` is ordered by on-hand ascending.
    */
    if (p.onHand === 0 || (p.onHand <= p.reorderPoint && p.reorderPoint > 0)) {
      low.push({
        productId: p.id,
        name: p.name,
        unit: p.unit,
        onHand: p.onHand,
        reorderPoint: p.reorderPoint,
        suggested: suggestedOrder(p.onHand, p.reorderPoint),
      });
    }

    // ── EXPIRING. Every dated batch inside the window, expired ones included
    // and first. A batch with no date cannot expire and is not guessed at.
    for (const b of p.batches) {
      if (!b.expiryDate) continue;
      const bucket = expiryBucket(b.expiryDate, asOf);
      const days = Math.round((b.expiryDate.getTime() - asOf.getTime()) / 86_400_000);
      if (bucket !== "expired" && days > opts.expiryWindowDays) continue;
      expiring.push({
        batchId: b.id,
        productId: p.id,
        productName: p.name,
        supplierName: b.supplier?.name ?? null,
        lotNumber: b.lotNumber,
        expiryDate: b.expiryDate,
        unit: p.unit,
        quantity: b.quantity,
        valueCentavos: b.quantity * b.costCentavos,
        bucket,
        days,
      });
    }

    // Nothing on the shelf is neither dead nor slow — it is simply absent.
    if (p.onHand <= 0) continue;

    // ── DEAD. Never sold, or not sold since the cut-off.
    if (lastSold === null || lastSold < deadBefore) {
      dead.push({
        productId: p.id,
        name: p.name,
        unit: p.unit,
        onHand: p.onHand,
        lastSold,
        valueCentavos: p.valueCentavos,
      });
      continue; // dead already; listing it as slow as well is the same money twice
    }

    // ── SLOW-MOVING. It sells, but the shelf will outlast the interest in it.
    // Six months of supply is the line: past that, the capital is better spent
    // on something that turns, and an expiry date is usually closer than the
    // sell-through.
    const dos = daysOfSupply(p.onHand, sold, SLOW_WINDOW);
    if (dos !== null && dos > 180) {
      slow.push({
        productId: p.id,
        name: p.name,
        unit: p.unit,
        onHand: p.onHand,
        sold,
        daysOfSupply: dos,
        lastSold,
        valueCentavos: p.valueCentavos,
      });
    }
  }

  // Worst first in every list: the thing to act on should not need scrolling to.
  low.sort((a, b) => a.onHand - b.onHand || a.name.localeCompare(b.name));
  expiring.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
  dead.sort((a, b) => b.valueCentavos - a.valueCentavos);
  slow.sort((a, b) => (b.daysOfSupply ?? 0) - (a.daysOfSupply ?? 0));

  return {
    low,
    expiring,
    dead,
    slow,
    windowDays: opts.expiryWindowDays,
    deadDays: opts.deadStockDays,
    noReorderPoint,
  };
}
