import type { Prisma } from "@prisma/client";

/**
 * The product-side outbox and inbox for the agent-portal connection kit.
 *
 * In packages/db rather than packages/core because they write tables in this
 * schema — the same reason provisioning lives here. Every function takes the
 * caller's transaction and never opens one: the caller decides what else
 * commits with it, which for enqueue is the point.
 *
 * Sending is in @servd/core/agent-kit (deliverEvent, retryDelayMs); this file
 * only stores and claims.
 */
type Tx = Prisma.TransactionClient;

export interface OutboxEvent {
  event_id: string;
  type: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

/** Queue an event. Call inside the transaction that makes it true. */
export async function enqueueProductEvent(tx: Tx, productSlug: string, event: OutboxEvent): Promise<void> {
  await tx.productEventOutbox.create({
    data: {
      productSlug,
      eventId: event.event_id,
      type: event.type,
      payload: event as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

export interface ClaimedEvent {
  id: string;
  attempts: number;
  payload: unknown;
}

/** How long a claimed row is invisible to other drains while it is being sent. */
export const OUTBOX_LEASE_MS = 2 * 60 * 1000;

/**
 * Claim due events, oldest first, by LEASING them: their nextAttemptAt is
 * pushed OUTBOX_LEASE_MS into the future in this short statement, and the
 * caller sends them afterwards, outside any transaction. A lock held across an
 * HTTP call would outlive the transaction timeout; a lease cannot, and if the
 * process dies mid-send the row simply comes due again when the lease runs
 * out.
 *
 * SKIP LOCKED so two drains running at once (the cron and an inline flush)
 * never claim the same row. Oldest first, so a customer's signup reaches the
 * portal before their payment does — the portal copes with the reverse, but
 * there is no reason to make it.
 */
export async function claimDueEvents(tx: Tx, productSlug: string, now: Date, limit: number): Promise<ClaimedEvent[]> {
  const leaseUntil = new Date(now.getTime() + OUTBOX_LEASE_MS);
  return tx.$queryRaw<ClaimedEvent[]>`
    update product_event_outbox o
       set "nextAttemptAt" = ${leaseUntil}
      from (
        select id from product_event_outbox
         where "productSlug" = ${productSlug}
           and status = 'pending'
           and "nextAttemptAt" <= ${now}
         order by "createdAt" asc
         limit ${limit}
         for update skip locked
      ) due
     where o.id = due.id
    returning o.id, o.attempts, o.payload, o."createdAt"`.then((rows) =>
    // UPDATE … RETURNING does not keep the subquery's order.
    (rows as (ClaimedEvent & { createdAt: Date })[])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(({ id, attempts, payload }) => ({ id, attempts, payload })),
  );
}

export async function markEventSent(tx: Tx, id: string, portalStatus: string, now: Date): Promise<void> {
  await tx.productEventOutbox.update({
    where: { id },
    data: { status: "sent", sentAt: now, portalStatus, lastStatus: 200, lastError: null, attempts: { increment: 1 } },
    select: { id: true },
  });
}

export async function markEventRetry(
  tx: Tx,
  id: string,
  nextAttemptAt: Date,
  lastStatus: number | null,
  lastError: string,
): Promise<void> {
  await tx.productEventOutbox.update({
    where: { id },
    data: { nextAttemptAt, lastStatus, lastError: lastError.slice(0, 500), attempts: { increment: 1 } },
    select: { id: true },
  });
}

export async function markEventFailed(tx: Tx, id: string, lastStatus: number, lastError: string): Promise<void> {
  await tx.productEventOutbox.update({
    where: { id },
    data: { status: "failed", lastStatus, lastError: lastError.slice(0, 500), attempts: { increment: 1 } },
    select: { id: true },
  });
}

/**
 * Record a callback before applying it. False means it was already recorded —
 * a redelivery — and must not be applied again. Uses ON CONFLICT DO NOTHING so
 * a duplicate does not abort the caller's transaction.
 */
export async function recordCallback(
  tx: Tx,
  productSlug: string,
  callback: { event_id: string; type: string },
): Promise<boolean> {
  const r = await tx.productCallbackInbox.createMany({
    data: [
      {
        eventId: callback.event_id,
        productSlug,
        type: callback.type,
        payload: callback as unknown as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });
  return r.count === 1;
}

export async function setCallbackOutcome(tx: Tx, eventId: string, outcome: string): Promise<void> {
  await tx.productCallbackInbox.update({ where: { eventId }, data: { outcome }, select: { eventId: true } });
}
