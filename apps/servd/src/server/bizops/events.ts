import "server-only";

import { randomUUID } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The customer event timeline — write side.
 *
 * This is called from inside live paths: a Xendit webhook, an activation, a
 * preview reach. Those paths take real money and open real shops, so the single
 * most important property of this module is that **it cannot fail them**.
 *
 * Three rules follow from that, and none of them is optional:
 *
 *  1. `logEvent` NEVER throws. Every call is wrapped internally, so a caller
 *     that forgets its own try/catch is still safe.
 *  2. It is never given the transaction of the thing it describes. A rollback
 *     of the log must not roll back the payment, and — the direction that
 *     actually bites — a log row must not hold a lock inside a payment
 *     transaction.
 *  3. Nothing in the product reads it to decide anything. It is an audit trail
 *     for a human, so a missing row costs a gap in a timeline, never a wrong
 *     decision somewhere else.
 */

export type CustomerEventType =
  | "lead_created"
  | "preview_sent"
  | "stage_change"
  | "payment"
  | "activation"
  | "cap_reached"
  | "upsell_offered"
  | "upsell_sold"
  | "note";

export interface EventInput {
  leadId?: string | null;
  restaurantId?: string | null;
  eventType: CustomerEventType;
  /** A super-admin's email, or null when the system did it. */
  actor?: string | null;
  /** Centavos, matching every other money column. */
  amount?: number | null;
  meta?: Record<string, unknown> | null;
  occurredAt?: Date;
}

/**
 * Record one event. Returns whether it was written, and never throws.
 *
 * Callers are still encouraged to `void logEvent(...)` rather than await it
 * inside a hot path — but awaiting is safe, which matters more, because an
 * un-awaited promise in a serverless function can be killed before it flushes.
 */
export async function logEvent(input: EventInput): Promise<boolean> {
  if (!input.leadId && !input.restaurantId) return false; // nothing to attach it to
  try {
    await systemDb((tx) =>
      tx.customerEvent.create({
        data: {
          id: randomUUID(),
          leadId: input.leadId ?? null,
          restaurantId: input.restaurantId ?? null,
          eventType: input.eventType,
          actor: input.actor ?? null,
          amount: input.amount ?? null,
          meta: (input.meta ?? undefined) as never,
          occurredAt: input.occurredAt ?? new Date(),
        },
        select: { id: true },
      }),
    );
    return true;
  } catch (e) {
    // Logged, not thrown. Somebody reading server logs should be able to see
    // that the timeline has a hole; nobody's order should.
    console.error("[bizops] event log failed", input.eventType, e);
    return false;
  }
}
