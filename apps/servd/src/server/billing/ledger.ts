import "server-only";
import type { Prisma } from "@prisma/client";
import { splitRevenue } from "@/lib/partners/revenue-share";

/**
 * Record one settled payment against the partner that owns the merchant (D15).
 *
 * Called from inside the settlement transaction, so the row and the access it
 * paid for commit together. A payment that granted access without being recorded
 * is revenue nobody can see; a row recorded for access that rolled back is
 * revenue nobody received. Neither is discoverable after the fact, so they are
 * made impossible instead.
 *
 * SETTLED, NOT ISSUED. This is only ever called from the paid path. On a gateway
 * with no auto-charge every merchant is issued an invoice every month whether or
 * not they pay it, so a ledger of issuances would bill partners for money that
 * never arrived.
 */

export type LedgerKind = "subscription" | "addon" | "feature" | "activation";

/**
 * Whether partner_ledger_entries exists, checked once per process.
 *
 * WHY THIS AND NOT A try/catch. The obvious shape — attempt the insert, swallow
 * the error — does not work inside a transaction: Postgres aborts the whole
 * transaction on a failed statement, so every query after it fails too and the
 * activation this is bundled with rolls back. Catching would turn "the ledger
 * table is one migration behind" into "nobody's payment settles", which is
 * exactly the class of failure this codebase has been bitten by before.
 *
 * So the question is asked once, cheaply, before anything is attempted.
 */
let tableExists: boolean | null = null;

async function ledgerTableExists(tx: Prisma.TransactionClient): Promise<boolean> {
  if (tableExists !== null) return tableExists;
  try {
    const [row] = await tx.$queryRaw<{ present: boolean }[]>`
      select to_regclass('public.partner_ledger_entries') is not null as present`;
    tableExists = !!row?.present;
  } catch {
    tableExists = false;
  }
  if (!tableExists) {
    console.error(
      "partner_ledger_entries is missing — settlements are NOT being recorded. " +
        "Run packages/db/prisma/manual/add-partner-ledger.sql.",
    );
  }
  return tableExists;
}

export async function recordSettlement(
  tx: Prisma.TransactionClient,
  input: {
    /** The merchant id WITHIN `productId`. Named for history; see `productId`. */
    restaurantId: string;
    /**
     * WHICH PRODUCT'S TABLE `restaurantId` INDEXES.
     *
     * Defaulted to "servd" so every existing caller keeps working unchanged.
     * It exists because this function used to read `tx.restaurant` and nothing
     * else, which meant a pharmacy could never produce a ledger entry: a
     * partner selling Resceta earned nothing this platform recorded, and
     * CANVEXIA's 30% never accrued on a single peso of it.
     */
    productId?: "servd" | "pharmacy";
    providerRef: string;
    kind: LedgerKind;
    /** Centavos actually settled. */
    grossAmount: number;
    occurredAt?: Date;
  },
): Promise<void> {
  const { restaurantId, providerRef, kind, grossAmount } = input;
  const productId = input.productId ?? "servd";
  if (!providerRef || grossAmount < 0) return;
  if (!(await ledgerTableExists(tx))) return;

  // Both axes carry `partnerId`, so the question is the same and only the table
  // differs. Chosen from a union type rather than a free string: a product this
  // function has never heard of has no table to ask.
  const owner =
    productId === "pharmacy"
      ? await tx.pharmacy.findUnique({
          where: { id: restaurantId },
          select: { partnerId: true },
        })
      : await tx.restaurant.findUnique({
          where: { id: restaurantId },
          select: { partnerId: true },
        });
  if (!owner?.partnerId) {
    // A merchant owned by nobody. Should not exist after the house-partner
    // backfill, and inventing an owner here would put somebody else's revenue on
    // somebody's statement — so it is logged and skipped, loudly enough to find.
    console.error(`Settlement ${providerRef}: ${productId} ${restaurantId} has no partner.`);
    return;
  }

  // Idempotent by lookup rather than by catching the unique violation, for the
  // same transaction-abort reason as above. Gateways replay webhooks as a matter
  // of course; without this a replay would credit a partner twice.
  const already = await tx.partnerLedgerEntry.findUnique({
    where: { providerRef },
    select: { id: true },
  });
  if (already) return;

  const partner = await tx.partner.findUnique({
    where: { id: owner.partnerId },
    select: { revenueSharePct: true },
  });
  // A legacy zero-cut partner still gets a row: the payment happened, and a
  // ledger with gaps is not a ledger. Their share is simply 0.
  const sharePct = partner?.revenueSharePct ?? 0;
  const { partner: partnerAmount, hq: hqAmount } = splitRevenue(grossAmount, sharePct);

  await tx.partnerLedgerEntry.create({
    data: {
      partnerId: owner.partnerId,
      // The ledger is product-agnostic — a merchant id means nothing without
      // knowing which product's table it indexes — so every writer states its
      // own product, and this one is told rather than assuming.
      productId,
      merchantId: restaurantId,
      kind,
      providerRef,
      grossAmount,
      partnerAmount,
      hqAmount,
      // Snapshotted, not looked up at statement time. Renegotiating a partner's
      // percentage must not silently rewrite every statement already issued.
      sharePct,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    },
  });
}

/** Test seam: forget the cached table check. */
export function __resetLedgerTableCache(): void {
  tableExists = null;
}
