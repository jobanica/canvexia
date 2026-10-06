import type { Prisma } from "@prisma/client";
import {
  deliverEvent,
  retryDelayMs,
  type AgentPortalConfig,
  type ProductEvent,
} from "@servd/core/agent-kit";
import { claimDueEvents, markEventFailed, markEventRetry, markEventSent } from "./outbox";

type Tx = Prisma.TransactionClient;

export interface FlushSummary {
  configured: boolean;
  sent: number;
  retrying: number;
  failed: number;
}

/**
 * Deliver a product's queued events to the agent portal — the same loop for
 * every product, so they retry, back off and give up identically.
 *
 * `system` is the product's own system-scope transaction runner: the client
 * belongs to the app that owns the process. `hooks` let the product react to
 * an event the portal will not act on — for a receipt, telling the owner.
 */
export async function flushProductOutbox(opts: {
  config: AgentPortalConfig | null;
  productSlug: string;
  system: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  limit?: number;
  fetchImpl?: typeof fetch;
  hooks?: {
    /** The portal answered 200 but `refused` it (e.g. duplicate_bank_reference). */
    onRefused?: (tx: Tx, event: ProductEvent, error: string | undefined) => Promise<void>;
    /** The portal can never accept it as sent (4xx other than 401). */
    onFailed?: (tx: Tx, event: ProductEvent) => Promise<void>;
  };
}): Promise<FlushSummary> {
  const summary: FlushSummary = { configured: !!opts.config, sent: 0, retrying: 0, failed: 0 };
  const config = opts.config;
  if (!config) return summary;

  const claimed = await opts.system((tx) => claimDueEvents(tx, opts.productSlug, new Date(), opts.limit ?? 25));
  for (const row of claimed) {
    const event = row.payload as ProductEvent;
    const result = await deliverEvent(config, event, opts.fetchImpl ?? fetch);
    await opts.system(async (tx) => {
      if (result.kind === "delivered") {
        await markEventSent(tx, row.id, result.response.status, new Date());
        if (result.response.status === "refused") await opts.hooks?.onRefused?.(tx, event, result.response.error);
      } else if (result.kind === "failed") {
        await markEventFailed(tx, row.id, result.status, result.error);
        await opts.hooks?.onFailed?.(tx, event);
      } else {
        await markEventRetry(tx, row.id, new Date(Date.now() + retryDelayMs(row.attempts + 1)), result.status, result.error);
      }
    });
    summary[result.kind === "delivered" ? "sent" : result.kind === "failed" ? "failed" : "retrying"]++;
  }
  return summary;
}
