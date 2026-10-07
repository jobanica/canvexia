import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { deliverCallback, retryDelayMs, type PortalCallback } from "@servd/core/agent-kit";
import { systemDb, type Tx } from "@/server/scoped-db";
import { decryptSecret } from "@/server/crypto";

/** Bodies of the four callbacks, without the envelope. */
type CallbackData<T extends PortalCallback["type"]> = Extract<PortalCallback, { type: T }>["data"];

/**
 * Queue a callback in the caller's transaction. createMany, not create: a
 * verifier may insert into the queue but not read it, and create's RETURNING
 * would need the read.
 */
export async function queueCallback<T extends PortalCallback["type"]>(
  tx: Tx,
  productId: string,
  type: T,
  data: CallbackData<T>,
): Promise<string> {
  const eventId = `cb_${randomUUID()}`;
  const payload = { event_id: eventId, type, occurred_at: new Date().toISOString(), data } as PortalCallback;
  await tx.agentCallbackOutbox.createMany({
    data: [{ productId, eventId, type, payload: payload as unknown as Prisma.InputJsonValue }],
  });
  return eventId;
}

const LEASE_MS = 2 * 60 * 1000;

/**
 * Deliver due callbacks. A product with no callback URL or no secret yet is
 * skipped and its callbacks wait. Claims are leased (nextAttemptAt pushed
 * forward) so the cron and an inline flush never send one twice.
 */
export async function flushCallbacks(limit = 50, fetchImpl: typeof fetch = fetch) {
  const now = new Date();
  const claimed = await systemDb((tx) =>
    tx.$queryRaw<{ id: string; attempts: number; payload: PortalCallback; productId: string }[]>`
      update agent_callback_outbox o
         set "nextAttemptAt" = ${new Date(now.getTime() + LEASE_MS)}
        from (
          select c.id from agent_callback_outbox c
            join agent_products p on p.id = c."productId"
           where c.status = 'pending' and c."nextAttemptAt" <= ${now}
             and p."callbackUrl" is not null
           order by c."createdAt" asc
           limit ${limit}
           for update of c skip locked
        ) due
       where o.id = due.id
      returning o.id, o.attempts, o.payload, o."productId"`,
  );
  if (claimed.length === 0) return { sent: 0, retrying: 0, failed: 0 };

  const products = await systemDb((tx) =>
    tx.agentProduct.findMany({
      where: { id: { in: [...new Set(claimed.map((c) => c.productId))] } },
      select: { id: true, slug: true, callbackUrl: true, credential: { select: { secretEnc: true } } },
    }),
  );
  const summary = { sent: 0, retrying: 0, failed: 0 };
  for (const row of claimed) {
    const p = products.find((x) => x.id === row.productId);
    if (!p?.callbackUrl || !p.credential) continue; // lease lapses; retried when configured
    const result = await deliverCallback(
      { callbackUrl: p.callbackUrl, productSlug: p.slug, secret: decryptSecret(p.credential.secretEnc) },
      row.payload,
      fetchImpl,
    );
    await systemDb((tx) => {
      if (result.kind === "delivered") {
        summary.sent++;
        return tx.agentCallbackOutbox.update({
          where: { id: row.id },
          data: { status: "sent", sentAt: new Date(), lastStatus: 200, lastError: null, attempts: { increment: 1 } },
        });
      }
      if (result.kind === "failed") {
        summary.failed++;
        return tx.agentCallbackOutbox.update({
          where: { id: row.id },
          data: { status: "failed", lastStatus: result.status, lastError: result.error, attempts: { increment: 1 } },
        });
      }
      summary.retrying++;
      return tx.agentCallbackOutbox.update({
        where: { id: row.id },
        data: {
          nextAttemptAt: new Date(Date.now() + retryDelayMs(row.attempts + 1)),
          lastStatus: result.status,
          lastError: result.error.slice(0, 500),
          attempts: { increment: 1 },
        },
      });
    });
  }
  return summary;
}

/** After a decision commits. Never throws: the cron retries. */
export async function flushCallbacksQuietly(): Promise<void> {
  try {
    await flushCallbacks(10);
  } catch (e) {
    console.error("[callbacks] inline flush failed; the cron will retry:", e);
  }
}
