import "server-only";
import { flushProductOutbox, type FlushSummary } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";
import { portalConfig, productSlug } from "./config";

export type { FlushSummary };

/**
 * Deliver Servd's queued events to the agent portal.
 *
 * Called by the cron every few minutes, and inline right after a signup or a
 * receipt commits so the portal hears about it immediately in the normal case.
 * Safe to run concurrently: claims are leased (see claimDueEvents).
 */
export async function flushOutbox(limit = 25, fetchImpl: typeof fetch = fetch): Promise<FlushSummary> {
  return flushProductOutbox({
    config: portalConfig(),
    productSlug: productSlug(),
    system: systemDb,
    limit,
    fetchImpl,
    hooks: {
      // The portal took the receipt but will not act on it. The owner must be
      // told, or they wait forever for a confirmation that is not coming.
      onRefused: async (tx, event, error) => {
        if (event.type !== "payment.submitted") return;
        await tx.servdManualPayment.updateMany({
          where: { eventId: event.event_id, status: "submitted" },
          data: { status: "rejected", reason: refusalReason(error), decidedAt: new Date() },
        });
      },
      onFailed: async (tx, event) => {
        if (event.type !== "payment.submitted") return;
        await tx.servdManualPayment.updateMany({
          where: { eventId: event.event_id, status: "submitted" },
          data: { status: "rejected", reason: "This receipt could not be submitted. Please contact support.", decidedAt: new Date() },
        });
      },
    },
  });
}

export function refusalReason(code: string | undefined): string {
  if (code === "duplicate_bank_reference") return "That bank reference number has already been used.";
  if (code === "receipt_not_yours") return "This receipt could not be matched to your account. Please upload it again.";
  return "This receipt was not accepted. Please contact support.";
}

/** The inline flush after a commit. Never throws: the cron is the safety net. */
export async function flushOutboxQuietly(): Promise<void> {
  try {
    await flushOutbox(10);
  } catch (e) {
    console.error("[agent-portal] inline flush failed; the cron will retry:", e);
  }
}
