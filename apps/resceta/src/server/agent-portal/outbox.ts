import "server-only";
import { flushProductOutbox, type FlushSummary } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";
import { portalConfig, productSlug } from "./config";

/** Deliver Resceta's queued events. Same loop as Servd's (packages/db). */
export async function flushOutbox(limit = 25, fetchImpl: typeof fetch = fetch): Promise<FlushSummary> {
  const reject = (reason: string) => async (tx: Parameters<Parameters<typeof systemDb>[0]>[0], eventId: string) =>
    tx.rescetaManualPayment.updateMany({
      where: { eventId, status: "submitted" },
      data: { status: "rejected", reason, decidedAt: new Date() },
    });
  return flushProductOutbox({
    config: portalConfig(),
    productSlug: productSlug(),
    system: systemDb,
    limit,
    fetchImpl,
    hooks: {
      onRefused: async (tx, event, error) => {
        if (event.type !== "payment.submitted") return;
        await reject(
          error === "duplicate_bank_reference"
            ? "That bank reference number has already been used."
            : "This receipt was not accepted. Please contact support.",
        )(tx, event.event_id);
      },
      onFailed: async (tx, event) => {
        if (event.type !== "payment.submitted") return;
        await reject("This receipt could not be submitted. Please contact support.")(tx, event.event_id);
      },
    },
  });
}

export async function flushOutboxQuietly(): Promise<void> {
  try {
    await flushOutbox(10);
  } catch (e) {
    console.error("[agent-portal] inline flush failed; the cron will retry:", e);
  }
}
