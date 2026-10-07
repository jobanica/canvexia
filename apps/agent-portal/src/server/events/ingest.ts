import "server-only";
import type { Prisma } from "@prisma/client";
import {
  productEventSchema,
  type EventResponse,
  type ProductEvent,
} from "@servd/core/agent-kit";
import { systemDb, type Tx } from "@/server/scoped-db";
import { loadSettings } from "@/server/settings";
import { writeAudit, type Actor } from "@/server/audit";
import { normalizeReferralCode } from "@/lib/referral-code";
import { samePhone } from "@/lib/phone";
import { codeAttaches } from "@/lib/agent-status";
import { pickRule } from "@/lib/rules";
import type { PortalSettings } from "@/lib/settings";

/**
 * Product events in, portal state out.
 *
 * IDEMPOTENT on event_id: the row is inserted with ON CONFLICT DO NOTHING, and
 * a second delivery answers "duplicate" without touching anything. The kit
 * retries until it gets a 200, so every delivery after the first one that
 * landed is expected, not an error.
 *
 * OUT OF ORDER: an event about a customer the portal has not heard of yet — a
 * payment whose signup is still in the product's outbox — is stored
 * unprocessed with error = WAITING. When that customer's signup is processed,
 * their waiting events are replayed in the same transaction, oldest first. A
 * cron sweep (retryWaitingEvents) catches the one race that cannot: two
 * deliveries in flight at once, each invisible to the other's transaction.
 *
 * ATOMIC: storing the event and acting on it are one transaction. If acting on
 * it fails unexpectedly the event is not stored either, the product gets a 500
 * and retries — so a bug cannot leave an event marked received and never done.
 */

export const WAITING = "waiting_for_customer";

type Outcome =
  | { status: "processed"; note?: string }
  | { status: "pending" }
  | { status: "refused"; error: string };

const PRODUCT_ACTOR = (productId: string): Actor => ({ type: "product", id: productId, email: null });

export type ReceiveResult =
  | { http: 200; body: EventResponse }
  | { http: 422; body: { error: string } };

export async function receiveEvent(productId: string, raw: unknown): Promise<ReceiveResult> {
  const parsed = productEventSchema.safeParse(raw);
  if (!parsed.success) {
    // Not stored: an event that does not parse cannot be acted on, and storing
    // it under its event_id would make the corrected resend a "duplicate".
    const issue = parsed.error.issues[0];
    return { http: 422, body: { error: `${issue.path.join(".") || "event"}: ${issue.message}` } };
  }
  const event = parsed.data;

  const body = await systemDb(async (tx): Promise<EventResponse> => {
    const inserted = await tx.agentEvent.createMany({
      data: [
        {
          eventId: event.event_id,
          productId,
          type: event.type,
          payload: event as unknown as Prisma.InputJsonValue,
          externalCustomerId: event.data.external_customer_id,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return { event_id: event.event_id, status: "duplicate" };

    const row = await tx.agentEvent.findUniqueOrThrow({
      where: { eventId: event.event_id },
      select: { id: true },
    });
    const settings = await loadSettings(tx);
    const outcome = await applyAndRecord(tx, productId, row.id, event, settings);

    if (event.type === "customer.signed_up" && outcome.status === "processed") {
      await replayWaiting(tx, productId, event.data.external_customer_id, settings);
    }
    return toResponse(event.event_id, outcome);
  });
  return { http: 200, body };
}

function toResponse(eventId: string, o: Outcome): EventResponse {
  if (o.status === "refused") return { event_id: eventId, status: "refused", error: o.error };
  return { event_id: eventId, status: o.status };
}

async function applyAndRecord(
  tx: Tx,
  productId: string,
  eventRowId: string,
  event: ProductEvent,
  settings: PortalSettings,
): Promise<Outcome> {
  const outcome = await applyEvent(tx, productId, eventRowId, event, settings);
  await tx.agentEvent.update({
    where: { id: eventRowId },
    data: {
      attempts: { increment: 1 },
      processedAt: outcome.status === "pending" ? null : new Date(),
      error:
        outcome.status === "pending" ? WAITING : outcome.status === "refused" ? outcome.error : null,
    },
  });
  return outcome;
}

/** Replay a customer's waiting events, in the order they happened. */
async function replayWaiting(
  tx: Tx,
  productId: string,
  externalCustomerId: string,
  settings: PortalSettings,
): Promise<void> {
  const waiting = await tx.agentEvent.findMany({
    where: { productId, externalCustomerId, processedAt: null, error: WAITING },
    orderBy: { receivedAt: "asc" },
    select: { id: true, payload: true, receivedAt: true },
  });
  const events = waiting
    .map((w) => ({ id: w.id, event: productEventSchema.parse(w.payload), receivedAt: w.receivedAt }))
    .sort(
      (a, b) =>
        Date.parse(a.event.occurred_at) - Date.parse(b.event.occurred_at) ||
        a.receivedAt.getTime() - b.receivedAt.getTime(),
    );
  for (const w of events) await applyAndRecord(tx, productId, w.id, w.event, settings);
}

/**
 * Cron and admin "retry": every event still waiting for its customer, each in
 * its own transaction so one bad row cannot hold the rest back.
 */
export async function retryWaitingEvents(limit = 200): Promise<{ retried: number; processed: number }> {
  const waiting = await systemDb((tx) =>
    tx.agentEvent.findMany({
      where: { processedAt: null, error: WAITING },
      orderBy: { receivedAt: "asc" },
      take: limit,
      select: { id: true },
    }),
  );
  let processed = 0;
  for (const { id } of waiting) {
    if ((await retryEvent(id)) === "processed") processed++;
  }
  return { retried: waiting.length, processed };
}

/** Retry one unprocessed event. Processed events are never re-run. */
export async function retryEvent(id: string): Promise<Outcome["status"] | "already_processed"> {
  return systemDb(async (tx) => {
    // Lock the row: a cron run and an admin pressing Retry must not both apply it.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      select id from agent_events where id = ${id} and "processedAt" is null for update skip locked`;
    if (locked.length === 0) return "already_processed";
    const row = await tx.agentEvent.findUniqueOrThrow({ where: { id } });
    const event = productEventSchema.parse(row.payload);
    const settings = await loadSettings(tx);
    const outcome = await applyAndRecord(tx, row.productId, row.id, event, settings);
    if (event.type === "customer.signed_up" && outcome.status === "processed") {
      await replayWaiting(tx, row.productId, event.data.external_customer_id, settings);
    }
    return outcome.status;
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function applyEvent(
  tx: Tx,
  productId: string,
  eventRowId: string,
  event: ProductEvent,
  settings: PortalSettings,
): Promise<Outcome> {
  switch (event.type) {
    case "customer.signed_up":
      return customerSignedUp(tx, productId, event, settings);
    case "payment.submitted":
      return paymentSubmitted(tx, productId, eventRowId, event);
    case "customer.cancelled":
      return customerCancelled(tx, productId, event);
    case "customer.reactivated":
      return customerReactivated(tx, productId, event);
  }
}

function findReferral(tx: Tx, productId: string, externalCustomerId: string) {
  return tx.agentReferral.findUnique({
    where: { productId_externalCustomerId: { productId, externalCustomerId } },
  });
}

/**
 * Why a reported code did not attach, or null if it did. Pure, so the rules
 * are testable without a database.
 */
export function codeRefusal(
  agent: { status: "pending" | "active" | "suspended" | "removed"; mobile: string } | null,
  ownerPhone: string,
  settings: Pick<PortalSettings, "allow_self_referral">,
): string | null {
  if (!agent) return "unknown_code";
  if (!codeAttaches(agent.status)) return `agent_${agent.status}`;
  if (!settings.allow_self_referral && samePhone(agent.mobile, ownerPhone)) return "self_referral";
  return null;
}

async function customerSignedUp(
  tx: Tx,
  productId: string,
  event: Extract<ProductEvent, { type: "customer.signed_up" }>,
  settings: PortalSettings,
): Promise<Outcome> {
  const d = event.data;
  const existing = await findReferral(tx, productId, d.external_customer_id);
  if (existing) {
    // Already known — a resend under a new event id, or a product signing an
    // old customer up again. Either way the original agent stays: attachment
    // is permanent, and only an admin moves it.
    return { status: "processed", note: "already_known" };
  }

  const code = normalizeReferralCode(d.agent_code);
  const agent = code
    ? await tx.agent.findUnique({
        where: { referralCode: code },
        select: { id: true, status: true, mobile: true },
      })
    : null;
  const refusal = code ? codeRefusal(agent, d.owner_phone, settings) : null;
  const agentId = code && !refusal ? agent!.id : null;

  const signedUpAt = new Date(event.occurred_at);
  const rules = await tx.agentCommissionRule.findMany({
    where: { productId },
    select: { id: true, plan: true, validFrom: true, validTo: true },
  });
  const rule = pickRule(rules, d.plan ?? null, signedUpAt);

  const referral = await tx.agentReferral.create({
    data: {
      productId,
      externalCustomerId: d.external_customer_id,
      businessName: d.business_name,
      ownerName: d.owner_name,
      ownerPhone: d.owner_phone,
      plan: d.plan ?? null,
      signedUpAt,
      status: "lead",
      agentId,
      agentAttachedAt: agentId ? new Date() : null,
      reportedAgentCode: d.agent_code ?? null,
      commissionRuleId: rule?.id ?? null,
    },
  });
  await writeAudit(tx, PRODUCT_ACTOR(productId), {
    action: "referral.create",
    entity: "agent_referral",
    entityId: referral.id,
    after: {
      externalCustomerId: d.external_customer_id,
      agentId,
      reportedAgentCode: d.agent_code ?? null,
      codeNotAttached: refusal,
      commissionRuleId: rule?.id ?? null,
    },
  });
  return { status: "processed", note: refusal ?? undefined };
}

async function paymentSubmitted(
  tx: Tx,
  productId: string,
  eventRowId: string,
  event: Extract<ProductEvent, { type: "payment.submitted" }>,
): Promise<Outcome> {
  const d = event.data;
  const referral = await findReferral(tx, productId, d.external_customer_id);
  if (!referral) return { status: "pending" };

  // A receipt path names the product whose upload it was (api/v1/receipts).
  // One product pointing its payment at another product's file is refused.
  if (d.receipt_path) {
    const product = await tx.agentProduct.findUniqueOrThrow({ where: { id: productId }, select: { slug: true } });
    if (!d.receipt_path.startsWith(`receipts/${product.slug}/`)) {
      return { status: "refused", error: "receipt_not_yours" };
    }
  }

  // Checked before the insert so the refusal is an answer, not an aborted
  // transaction. The unique index is still what actually guarantees it.
  const clash = await tx.agentPayment.findUnique({
    where: { bankReference: d.bank_reference },
    select: { id: true },
  });
  if (clash) return { status: "refused", error: "duplicate_bank_reference" };

  const payment = await tx.agentPayment.create({
    data: {
      referralId: referral.id,
      type: d.type,
      monthsCovered: d.months_covered,
      billingMonthStart:
        d.type === "monthly" && d.billing_month_start
          ? new Date(`${d.billing_month_start}-01T00:00:00Z`)
          : null,
      amount: d.amount,
      bankReference: d.bank_reference,
      receiptPath: d.receipt_path ?? null,
      sourceEventId: eventRowId,
      submittedAt: new Date(event.occurred_at),
    },
  });
  await writeAudit(tx, PRODUCT_ACTOR(productId), {
    action: "payment.submit",
    entity: "agent_payment",
    entityId: payment.id,
    after: { referralId: referral.id, type: d.type, amount: d.amount, bankReference: d.bank_reference },
  });
  return { status: "processed" };
}

async function customerCancelled(
  tx: Tx,
  productId: string,
  event: Extract<ProductEvent, { type: "customer.cancelled" }>,
): Promise<Outcome> {
  const referral = await findReferral(tx, productId, event.data.external_customer_id);
  if (!referral) return { status: "pending" };
  if (referral.status === "churned") return { status: "processed", note: "already_churned" };
  await tx.agentReferral.update({ where: { id: referral.id }, data: { status: "churned" } });
  await writeAudit(tx, PRODUCT_ACTOR(productId), {
    action: "referral.cancel",
    entity: "agent_referral",
    entityId: referral.id,
    before: { status: referral.status },
    after: { status: "churned", reason: event.data.reason ?? null },
  });
  return { status: "processed" };
}

/**
 * A churned customer coming back. The agent is untouched and paidMonths is
 * untouched, so the count resumes where it stopped. They go back to `lead`,
 * not `active`: active means a confirmed payment, and they have not made one
 * in this stint yet.
 */
async function customerReactivated(
  tx: Tx,
  productId: string,
  event: Extract<ProductEvent, { type: "customer.reactivated" }>,
): Promise<Outcome> {
  const referral = await findReferral(tx, productId, event.data.external_customer_id);
  if (!referral) return { status: "pending" };
  if (referral.status !== "churned") return { status: "processed", note: "not_churned" };
  await tx.agentReferral.update({ where: { id: referral.id }, data: { status: "lead" } });
  await writeAudit(tx, PRODUCT_ACTOR(productId), {
    action: "referral.reactivate",
    entity: "agent_referral",
    entityId: referral.id,
    before: { status: "churned" },
    after: { status: "lead", paidMonths: referral.paidMonths },
  });
  return { status: "processed" };
}
