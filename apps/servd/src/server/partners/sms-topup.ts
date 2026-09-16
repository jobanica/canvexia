import "server-only";
import { packFor } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getBillingProvider } from "@/server/billing";
import type { SettlementScope } from "@/server/billing/settlement-scope";
import { creditTopUp } from "./sms-wallet";

/**
 * Buying SMS credits.
 *
 * THE PARTNER PAYS CANVEXIA, so this goes through the PLATFORM billing
 * provider, not a partner sub-account. That is the opposite direction from
 * everything else in the partner portal — merchants paying a partner — and it
 * is why the settlement below refuses anything but the platform scope: a
 * webhook arriving at a partner's own gateway endpoint must never be able to
 * credit that partner's wallet with money CANVEXIA never received.
 */

export type StartResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; message: string };

export async function startTopUp(input: {
  partnerId: string;
  credits: number;
  actorEmail: string;
}): Promise<StartResult> {
  const pack = packFor(input.credits);
  if (!pack) return { ok: false, message: "Choose one of the credit packs." };

  const provider = await getBillingProvider();
  if (!provider) return { ok: false, message: "Payments aren't set up on the platform yet." };

  let topUpId: string;
  try {
    topUpId = await systemDb(async (tx) => {
      const row = await tx.smsTopUp.create({
        data: {
          partnerId: input.partnerId,
          credits: pack.credits,
          amountCentavos: pack.priceCentavos,
          createdBy: input.actorEmail,
        },
        select: { id: true },
      });
      return row.id;
    });
  } catch {
    return { ok: false, message: "Couldn't start that purchase. Try again." };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let checkout;
  try {
    checkout = await provider.createInvoiceCheckout({
      amount: pack.priceCentavos,
      description: `CANVEXIA — ${pack.credits.toLocaleString("en-PH")} SMS credits`,
      // Prefixed so it is obvious in the gateway what this is, and so a human
      // reading the Xendit dashboard can find the row it belongs to.
      referenceNumber: `sms-${topUpId.slice(0, 12)}`,
      successUrl: `${base}/partner/sms/credits?paid=1`,
    });
  } catch {
    return { ok: false, message: "Couldn't open checkout. Try again." };
  }

  try {
    await systemDb((tx) =>
      tx.smsTopUp.update({
        where: { id: topUpId },
        data: { providerRef: checkout.gatewayRef },
        select: { id: true },
      }),
    );
  } catch {
    // Without the reference the webhook cannot find this row, so the purchase
    // would be paid and never credited. Better to refuse now.
    return { ok: false, message: "Couldn't open checkout. Try again." };
  }

  return { ok: true, checkoutUrl: checkout.checkoutUrl };
}

/**
 * Settle a paid credit purchase. Called from the platform webhook.
 *
 * REFUSES ANY SCOPE BUT THE PLATFORM'S. Credits are sold by CANVEXIA for
 * CANVEXIA's money; a partner's own gateway endpoint settling one would mean a
 * partner crediting their own wallet from a payment that landed in their
 * account. Returns false rather than throwing, so the webhook's dispatch chain
 * simply moves on to the next handler.
 */
export async function creditSmsTopUpByProviderRef(
  providerRef: string,
  scope: SettlementScope,
): Promise<boolean> {
  if (!providerRef || scope.kind !== "platform") return false;
  try {
    const row = await systemDb((tx) =>
      tx.smsTopUp.findFirst({ where: { providerRef }, select: { id: true } }),
    );
    if (!row) return false;
    // Idempotent inside: a second delivery of the same event credits nothing.
    await creditTopUp(row.id);
    // True either way — this reference WAS an SMS top-up, so the dispatch chain
    // must stop here rather than trying to activate a subscription with it.
    return true;
  } catch {
    return false;
  }
}

export async function recentTopUps(partnerId: string) {
  try {
    return await systemDb((tx) =>
      tx.smsTopUp.findMany({
        where: { partnerId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          credits: true,
          amountCentavos: true,
          status: true,
          createdAt: true,
          paidAt: true,
        },
      }),
    );
  } catch {
    return [];
  }
}
