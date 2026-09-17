import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { addMonths } from "@/lib/billing/period";
import { recordSettlement } from "@/server/billing/ledger";

/**
 * Renewing a partner-sold subscription, by hand, with evidence.
 *
 * FOUR STATES, and the boundary between two of them is where the money moves:
 *
 *   requested         the merchant tapped Renew and is looking at the QR
 *   receipt_uploaded  they paid and uploaded proof
 *   confirmed         the partner recognised the payment — THIS extends the
 *                     subscription and writes CANVEXIA's 30% to the ledger
 *   rejected          the partner did not, with a reason the merchant sees
 *
 * Nothing here is automatic and nothing should be. The payment happens in cash
 * or on an e-wallet, off this system; there is no webhook to believe. A
 * photograph plus a human who recognises the transfer IS the settlement, and
 * pretending otherwise would let anyone extend their own subscription by
 * uploading a picture of a sunset.
 */

export type RenewalStatus = "requested" | "receipt_uploaded" | "confirmed" | "rejected";

export interface RenewalRow {
  id: string;
  merchantId: string;
  productId: string;
  merchantName: string;
  amountCentavos: number;
  months: number;
  status: RenewalStatus;
  receiptPath: string | null;
  note: string | null;
  requestedAt: Date;
  decidedAt: Date | null;
}

/** The renewal a merchant currently has in flight, if any. */
export async function openRenewal(merchantId: string, productId = "servd") {
  return systemDb((tx) =>
    tx.merchantRenewal.findFirst({
      where: { merchantId, productId, status: { in: ["requested", "receipt_uploaded"] } },
      orderBy: { requestedAt: "desc" },
    }),
  ).catch(() => null);
}

/** The last decided one, so a rejection can be explained rather than vanish. */
export async function lastDecidedRenewal(merchantId: string, productId = "servd") {
  return systemDb((tx) =>
    tx.merchantRenewal.findFirst({
      where: { merchantId, productId, status: { in: ["confirmed", "rejected"] } },
      orderBy: { decidedAt: "desc" },
    }),
  ).catch(() => null);
}

/** Everything waiting on this partner, oldest first — they are owed an answer. */
export async function pendingRenewals(partnerId: string): Promise<RenewalRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.merchantRenewal.findMany({
        where: { partnerId, status: { in: ["requested", "receipt_uploaded"] } },
        orderBy: { requestedAt: "asc" },
        take: 100,
      }),
    );
    if (rows.length === 0) return [];
    /*
      NAMES FROM BOTH AXES. A merchant id means nothing without its product —
      ids are unique within a product, not across them — so this asks each
      table for the ids that belong to it rather than asking one table for all
      of them and labelling the rest "Unknown".
    */
    const idsFor = (product: string) =>
      rows.filter((r) => r.productId === product).map((r) => r.merchantId);
    const [restaurants, pharmacies] = await Promise.all([
      idsFor("servd").length
        ? systemDb((tx) =>
            tx.restaurant.findMany({
              where: { id: { in: idsFor("servd") } },
              select: { id: true, name: true },
            }),
          )
        : Promise.resolve([]),
      idsFor("pharmacy").length
        ? systemDb((tx) =>
            tx.pharmacy.findMany({
              where: { id: { in: idsFor("pharmacy") } },
              select: { id: true, name: true },
            }),
          )
        : Promise.resolve([]),
    ]);
    // Keyed by product AND id, because the two id spaces are separate and a
    // collision would label one merchant with another's name.
    const byId = new Map<string, string>([
      ...restaurants.map((n) => [`servd:${n.id}`, n.name] as [string, string]),
      ...pharmacies.map((n) => [`pharmacy:${n.id}`, n.name] as [string, string]),
    ]);
    return rows.map((r) => ({
      id: r.id,
      merchantId: r.merchantId,
      productId: r.productId,
      merchantName: byId.get(`${r.productId}:${r.merchantId}`) ?? "Unknown",
      amountCentavos: r.amountCentavos,
      months: r.months,
      status: r.status as RenewalStatus,
      receiptPath: r.receiptPath,
      note: r.note,
      requestedAt: r.requestedAt,
      decidedAt: r.decidedAt,
    }));
  } catch {
    return [];
  }
}

/**
 * Confirm a renewal: extend the subscription and record the split.
 *
 * ONE TRANSACTION, and the order inside it matters. The renewal row is claimed
 * FIRST, by a conditional update that only matches a row still awaiting a
 * decision — so two taps on Confirm, or two seats confirming at once, produce
 * one extension and one ledger row rather than two of each.
 *
 * THE PERIOD IS EXTENDED FROM WHICHEVER IS LATER: the current period end, or
 * now. Renewing early must add a month to what they already have rather than
 * silently throwing away the remainder; renewing after a lapse must start from
 * today rather than backdating into a gap they did not pay for.
 */
export async function confirmRenewal(input: {
  renewalId: string;
  partnerId: string;
  decidedBy: string;
  /** What the partner says they actually collected. The 30% is a share of this. */
  amountCentavos: number;
}): Promise<
  { ok: true; paidUntil: Date; invoiceId: string } | { ok: false; message: string }
> {
  const { renewalId, partnerId, decidedBy, amountCentavos } = input;
  if (!Number.isInteger(amountCentavos) || amountCentavos < 0) {
    return { ok: false, message: "Enter what you collected." };
  }

  try {
    const result = await systemDb(async (tx) => {
      // Claim it. Ownership and state are both in the WHERE clause, so another
      // partner's renewal and an already-decided one both match zero rows.
      const claimed = await tx.merchantRenewal.updateMany({
        where: {
          id: renewalId,
          partnerId,
          status: { in: ["requested", "receipt_uploaded"] },
        },
        data: {
          status: "confirmed",
          amountCentavos,
          decidedAt: new Date(),
          decidedBy,
          ledgerRef: `renewal:${renewalId}`,
        },
      });
      if (claimed.count === 0) return null;

      const row = await tx.merchantRenewal.findUnique({ where: { id: renewalId } });
      if (!row) return null;

      /*
        THE PRODUCT COMES OFF THE RENEWAL ROW, not off a form and not assumed.
        `merchant_renewals` has carried `productId` since it was written; this
        function simply never read it, which is why a pharmacy renewal could be
        requested, receipted and confirmed and then extend nothing.
      */
      const productId = row.productId === "pharmacy" ? "pharmacy" : "servd";

      const sub = await tx.subscription.findFirst({
        // Both, always. Without `productId` this matches on an id alone across
        // two separate id spaces.
        where: { restaurantId: row.merchantId, productId },
        orderBy: { createdAt: "desc" },
        select: { id: true, currentPeriodEnd: true },
      });
      if (!sub) return null;

      const now = new Date();
      const base =
        sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      const paidUntil = addMonths(base, row.months);

      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: "active", currentPeriodEnd: paidUntil, failedCharges: 0 },
      });
      // Renewing brings a suspended shop back. Somebody who has just paid should
      // not have to ask a second time to be switched on. Resceta reads the same
      // column in the same sense — its counter refuses to sell when it is not
      // "active" — so the sentence is true of both.
      if (productId === "pharmacy") {
        await tx.pharmacy.updateMany({
          where: { id: row.merchantId, partnerId },
          data: { status: "active" },
        });
      } else {
        await tx.restaurant.updateMany({
          where: { id: row.merchantId, partnerId },
          data: { status: "active" },
        });
      }

      /**
       * THE MERCHANT'S INVOICE, written in the same transaction as the money.
       *
       * Into `restaurant_invoices` rather than a parallel table, because the
       * merchant's billing screen already lists those as "Payment history" —
       * so a partner-issued receipt lands where the owner already looks.
       *
       * `providerRef` is the same `renewal:{id}` the ledger uses and is unique,
       * so a re-confirm cannot print a second invoice for one payment. The
       * number is derived from the row's own id rather than a counter: a
       * per-partner sequence would need a lock, and two confirmations racing
       * for the same number would fail one of them and take a recorded payment
       * down with it.
       */
      const invoice = await tx.restaurantInvoice.create({
        data: {
          restaurantId: row.merchantId,
          productId,
          amount: amountCentavos,
          status: "paid",
          periodStart: base,
          periodEnd: paidUntil,
          paidAt: now,
          providerRef: `renewal:${renewalId}`,
          issuedByPartnerId: partnerId,
        },
        select: { id: true },
      });
      const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
      await tx.restaurantInvoice.update({
        where: { id: invoice.id },
        data: { invoiceNo: `INV-${stamp}-${invoice.id.slice(0, 6).toUpperCase()}` },
        select: { id: true },
      });

      /**
       * CANVEXIA's 30%, through the ledger writer that already exists rather
       * than a second one beside it. It is idempotent on `providerRef`, snapshots
       * the split percentage in force today, and refuses a merchant with no
       * owner — three things this would otherwise have to get right again.
       */
      await recordSettlement(tx, {
        restaurantId: row.merchantId,
        productId,
        providerRef: `renewal:${renewalId}`,
        kind: "subscription",
        grossAmount: amountCentavos,
        occurredAt: now,
      });

      return { paidUntil, invoiceId: invoice.id };
    });

    if (!result) return { ok: false, message: "That renewal has already been dealt with." };
    return { ok: true, paidUntil: result.paidUntil, invoiceId: result.invoiceId };
  } catch {
    return { ok: false, message: "Couldn't confirm that. Try again." };
  }
}

/** Turn one down, with a reason the merchant will read. */
export async function rejectRenewal(input: {
  renewalId: string;
  partnerId: string;
  decidedBy: string;
  note: string;
}): Promise<{ ok: boolean; message?: string }> {
  const note = input.note.trim().slice(0, 300);
  if (!note) return { ok: false, message: "Say why, so they can fix it." };
  try {
    const done = await systemDb((tx) =>
      tx.merchantRenewal.updateMany({
        where: {
          id: input.renewalId,
          partnerId: input.partnerId,
          status: { in: ["requested", "receipt_uploaded"] },
        },
        data: { status: "rejected", note, decidedAt: new Date(), decidedBy: input.decidedBy },
      }),
    );
    if (done.count === 0) return { ok: false, message: "That renewal has already been dealt with." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't do that. Try again." };
  }
}
