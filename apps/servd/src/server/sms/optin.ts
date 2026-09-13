"use server";

import { z } from "zod";
import { systemDb } from "@/server/tenancy/scoped-db";
import { normalizePhPhone } from "@/lib/sms/phone";
import { marketingConsentText, confirmationSmsBody } from "@/lib/sms/consent";
import { getSmsProvider } from "@/server/sms";

const schema = z.object({
  slug: z.string().min(1),
  phone: z.string().min(1),
  name: z.string().trim().max(80).optional().or(z.literal("")),
  source: z.enum(["payment_screen", "feedback_screen"]),
  consent: z.literal(true), // checkbox MUST be checked; default-unchecked in UI
});

/**
 * Diner marketing opt-in. Always optional; ordering/paying never depends on it.
 *
 * Compliance baked in:
 *  - consent must be explicitly true (the checkbox is unchecked by default and
 *    not bundled with any terms acceptance);
 *  - we store proof: phone, timestamp, the exact wording shown, and the source;
 *  - default is DOUBLE opt-in — contact is `pending` until they reply YES;
 *  - marketing consent is separate from any transactional number.
 */
export async function submitSmsOptIn(input: {
  slug: string;
  phone: string;
  name?: string;
  source: "payment_screen" | "feedback_screen";
  consent: boolean;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please tick the box to opt in." };
  }

  const phone = normalizePhPhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "Enter a valid PH mobile number." };

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({
      where: { slug: parsed.data.slug, status: "active" },
      select: {
        id: true,
        name: true,
        displayName: true,
        smsSenderName: true,
        smsDoubleOptIn: true,
      },
    }),
  );
  if (!restaurant) return { ok: false, error: "Restaurant unavailable." };

  const displayName = restaurant.displayName || restaurant.name;
  const consentText = marketingConsentText(displayName);
  const doubleOptIn = restaurant.smsDoubleOptIn;
  const now = new Date();

  await systemDb((tx) =>
    tx.customerContact.upsert({
      where: { restaurantId_phone: { restaurantId: restaurant.id, phone } },
      create: {
        restaurantId: restaurant.id,
        phone,
        name: parsed.data.name || null,
        marketingConsent: doubleOptIn ? "pending" : "confirmed",
        consentText,
        consentSource: parsed.data.source,
        optInAt: now,
        confirmedAt: doubleOptIn ? null : now,
        optOutAt: null,
      },
      update: {
        name: parsed.data.name || undefined,
        marketingConsent: doubleOptIn ? "pending" : "confirmed",
        consentText,
        consentSource: parsed.data.source,
        optInAt: now,
        confirmedAt: doubleOptIn ? null : now,
        optOutAt: null,
      },
    }),
  );

  // Double opt-in: send the one confirmation message. We only mark `confirmed`
  // when they reply YES (handled by the inbound webhook).
  if (doubleOptIn) {
    const provider = getSmsProvider();
    if (provider && restaurant.smsSenderName) {
      await provider.send(
        restaurant.smsSenderName,
        phone,
        confirmationSmsBody(displayName),
      );
    }
    return {
      ok: true,
      message: "Almost done — reply YES to the text we just sent to confirm.",
    };
  }

  return { ok: true, message: "You're subscribed! Reply STOP anytime." };
}
