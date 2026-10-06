import { NextResponse } from "next/server";

/**
 * RETIRED (D38). Platform billing no longer goes through a payment gateway:
 * subscriptions, activations, add-ons and branches are paid by bank or QR
 * transfer and confirmed in the agent portal. Nothing this endpoint used to
 * settle can be created any more.
 *
 * 410 Gone rather than 404, so a gateway still configured to call here sees a
 * deliberate, permanent answer. Remove the webhook in the gateway dashboard.
 */
export async function POST() {
  return NextResponse.json({ error: "gone", detail: "Gateway billing is retired." }, { status: 410 });
}
