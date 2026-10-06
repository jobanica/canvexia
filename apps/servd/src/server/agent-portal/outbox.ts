import "server-only";
import { deliverEvent, retryDelayMs, type ProductEvent } from "@servd/core/agent-kit";
import { claimDueEvents, markEventFailed, markEventRetry, markEventSent } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";
import { portalConfig, productSlug } from "./config";

export interface FlushSummary {
  configured: boolean;
  sent: number;
  retrying: number;
  failed: number;
}

/**
 * Deliver queued events to the agent portal.
 *
 * Called by the cron every few minutes, and inline right after a signup or a
 * receipt commits so the portal hears about it immediately in the normal case.
 * Either way it is safe to run concurrently: claims are leased (see
 * claimDueEvents), so no event is sent twice by two runs.
 */
export async function flushOutbox(limit = 25, fetchImpl: typeof fetch = fetch): Promise<FlushSummary> {
  const config = portalConfig();
  const summary: FlushSummary = { configured: !!config, sent: 0, retrying: 0, failed: 0 };
  if (!config) return summary;

  const now = new Date();
  const claimed = await systemDb((tx) => claimDueEvents(tx, productSlug(), now, limit));

  for (const row of claimed) {
    const event = row.payload as ProductEvent;
    const result = await deliverEvent(config, event, fetchImpl);
    await systemDb(async (tx) => {
      if (result.kind === "delivered") {
        await markEventSent(tx, row.id, result.response.status, new Date());
        // The portal accepted the event but will not act on it. For a receipt
        // that means the owner must be told, or they will wait forever for a
        // confirmation that is not coming.
        if (result.response.status === "refused" && event.type === "payment.submitted") {
          await tx.servdManualPayment.updateMany({
            where: { eventId: event.event_id, status: "submitted" },
            data: { status: "rejected", reason: refusalReason(result.response.error), decidedAt: new Date() },
          });
        }
      } else if (result.kind === "failed") {
        await markEventFailed(tx, row.id, result.status, result.error);
        if (event.type === "payment.submitted") {
          await tx.servdManualPayment.updateMany({
            where: { eventId: event.event_id, status: "submitted" },
            data: { status: "rejected", reason: "This receipt could not be submitted. Please contact support.", decidedAt: new Date() },
          });
        }
      } else {
        await markEventRetry(tx, row.id, new Date(Date.now() + retryDelayMs(row.attempts + 1)), result.status, result.error);
      }
    });
    summary[result.kind === "delivered" ? "sent" : result.kind === "failed" ? "failed" : "retrying"]++;
  }
  return summary;
}

function refusalReason(code: string | undefined): string {
  if (code === "duplicate_bank_reference") return "That bank reference number has already been used.";
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
