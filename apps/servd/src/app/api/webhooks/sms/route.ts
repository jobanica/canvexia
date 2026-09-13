import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getSmsProvider } from "@/server/sms";
import { normalizePhPhone } from "@/lib/sms/phone";
import { classifyReply } from "@/lib/sms/keywords";

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

  const phone = normalizePhPhone(inbound.from);
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
  } else if (intent === "confirm") {
    await systemDb((tx) =>
      tx.customerContact.updateMany({
        where: { phone, marketingConsent: "pending" },
        data: { marketingConsent: "confirmed", confirmedAt: now },
      }),
    );
  }

  return new Response("ok", { status: 200 });
}
