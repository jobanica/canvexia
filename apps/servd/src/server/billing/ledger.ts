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
        "Run prisma/manual/add-partner-ledger.sql.",
    );
  }
  return tableExists;
}

export async function recordSettlement(
  tx: Prisma.TransactionClient,
  input: {
    restaurantId: string;
    providerRef: string;
    kind: LedgerKind;
    /** Centavos actually settled. */
    grossAmount: number;
    occurredAt?: Date;
  },
): Promise<void> {
  const { restaurantId, providerRef, kind, grossAmount } = input;
  if (!providerRef || grossAmount < 0) return;
  if (!(await ledgerTableExists(tx))) return;

  const restaurant = await tx.restaurant.findUnique({
    where: { id: restaurantId },
    select: { partnerId: true },
  });
  if (!restaurant?.partnerId) {
    // A merchant owned by nobody. Should not exist after the house-partner
    // backfill, and inventing an owner here would put somebody else's revenue on
    // somebody's statement — so it is logged and skipped, loudly enough to find.
    console.error(`Settlement ${providerRef}: restaurant ${restaurantId} has no partner.`);
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
    where: { id: restaurant.partnerId },
    select: { revenueSharePct: true },
  });
  // A legacy zero-cut partner still gets a row: the payment happened, and a
  // ledger with gaps is not a ledger. Their share is simply 0.
  const sharePct = partner?.revenueSharePct ?? 0;
  const { partner: partnerAmount, hq: hqAmount } = splitRevenue(grossAmount, sharePct);

  await tx.partnerLedgerEntry.create({
    data: {
      partnerId: restaurant.partnerId,
      restaurantId,
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
