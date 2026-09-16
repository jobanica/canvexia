import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getSmsProvider } from "@/server/sms";
import { classifyReply, normalizeMobile } from "@servd/core";
import { markOptOutConfirmed, optOutEverywhere } from "@/server/partners/sms-contacts";
import { sendOptOutConfirmation } from "@/server/partners/sms-send";
import { recordInbound } from "@/server/partners/sms-inbox";

/**
 * Inbound SMS webhook for double-opt-in confirmation (YES) and opt-out (STOP).
 *
 *  - YES  → flips the diner's PENDING contacts to `confirmed` (only now may they
 *           receive marketing).
 *  - STOP → immediately flips ALL of that number's contacts to `opted_out`; we
 *           never message opted-out numbers again.
 *
 * Inbound mapping to a specific restaurant depends on the provider/sender setup;
 * here we match by phone across the platform, which is correct for the YES/STOP
 * semantics (confirm the pending intent, or opt out everywhere).
 *
 * AS OF A8.1 THERE ARE TWO CONTACT BOOKS — a restaurant's diners and a
 * partner's business owners — and a STOP applies to BOTH. The person texting
 * has no idea the platform has two tables, and "I told you to stop" is not a
 * sentence anybody should have to say twice. `tests/sms/stop-is-platform-wide`
 * is the assertion that keeps this true.
 */
export async function POST(req: NextRequest) {
  const provider = getSmsProvider();
  if (!provider) return new Response("SMS not configured", { status: 404 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    payload = Object.fromEntries((await req.formData()).entries());
  }

  const inbound = provider.parseInbound(payload);
  if (!inbound) return new Response("ignored", { status: 200 });

  const phone = normalizeMobile(inbound.from);
  if (!phone) return new Response("ignored", { status: 200 });

  const intent = classifyReply(inbound.text);
  const now = new Date();

  if (intent === "stop") {
    await systemDb((tx) =>
      tx.customerContact.updateMany({
        where: { phone },
        data: { marketingConsent: "opted_out", optOutAt: now },
      }),
    );

    // The partner side, and the ONE confirmation the brief allows. Rows that
    // already had a confirmation sent get none: somebody who texts STOP three
    // times must not receive three texts back, which would be the one thing
    // more annoying than the message they were trying to stop.
    const affected = await optOutEverywhere(phone, now);
    const unconfirmed = affected.filter((a) => !a.confirmed);
    if (unconfirmed.length > 0) {
      await sendOptOutConfirmation(unconfirmed[0].partnerId, phone);
      await markOptOutConfirmed(
        unconfirmed.map((a) => a.id),
        now,
      );
    }
  } else if (intent === "confirm") {
    await systemDb((tx) =>
      tx.customerContact.updateMany({
        where: { phone, marketingConsent: "pending" },
        data: { marketingConsent: "confirmed", confirmedAt: now },
      }),
    );
  } else {
    // A real message. It goes in the inbox and notifies whoever the contact is
    // assigned to — A8.4. Dropping it, which is what this route used to do,
    // means a business owner asking a question gets silence.
    await recordInbound(phone, inbound.text, now);
  }

  return new Response("ok", { status: 200 });
}
