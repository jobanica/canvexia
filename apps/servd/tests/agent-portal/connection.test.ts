import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  newEventId,
  signedHeaders,
  verifyRequest,
  SIGNATURE_HEADERS,
  type PortalCallback,
} from "@servd/core/agent-kit";
import { enqueueProductEvent } from "@servd/db";

/**
 * Servd ↔ agent portal, against a real database: the outbox delivers and
 * retries, the callbacks apply once, and manual billing moves access.
 *
 * The portal itself is a fake `fetch` here — what it receives is checked with
 * the same signature verification the real portal runs. The real portal's
 * side is covered in apps/agent-portal/tests/isolation/events-api.test.ts.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;
const prisma = new PrismaClient();

const stamp = randomUUID().slice(0, 8);
const SLUG = `servd-${stamp}`;
const SECRET = `cvx_servd_${stamp}`;
process.env.AGENT_PORTAL_URL = "https://agents.test";
process.env.AGENT_PORTAL_PRODUCT_SLUG = SLUG;
process.env.AGENT_PORTAL_SECRET = SECRET;

function asSuper<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  }) as Promise<T>;
}

let restaurantId = "";
let subscriptionId = "";

type Sent = { url: string; body: string; verified: boolean };
function fakePortal(respond: (body: unknown) => { status: number; json: unknown }) {
  const sent: Sent[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = String(init.body);
    const h = new Headers(init.headers as Record<string, string>);
    const v = verifyRequest({
      secret: SECRET,
      timestamp: h.get(SIGNATURE_HEADERS.timestamp),
      signature: h.get(SIGNATURE_HEADERS.signature),
      method: String(init.method),
      pathname: new URL(url).pathname,
      rawBody: body,
    });
    sent.push({ url, body, verified: v.ok && h.get(SIGNATURE_HEADERS.product) === SLUG });
    const r = respond(JSON.parse(body));
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

async function queue(type: string, data: Record<string, unknown>) {
  const event_id = newEventId();
  await asSuper((tx) => enqueueProductEvent(tx, SLUG, { event_id, type, occurred_at: new Date().toISOString(), data }));
  return event_id;
}

async function manualPayment(ref: string, extra: Record<string, unknown> = {}) {
  const eventId = newEventId();
  await asSuper((tx) =>
    tx.servdManualPayment.create({
      data: { restaurantId, type: "monthly", monthsCovered: 1, billingMonthStart: new Date("2030-01-01T00:00:00Z"), amount: 80000, bankReference: ref, eventId, ...extra },
    }),
  );
  return eventId;
}

function callbackRequest(cb: object, opts: { secret?: string } = {}) {
  const body = JSON.stringify(cb);
  const path = "/api/agent-portal/callbacks";
  return new Request(`https://www.servdph.test${path}`, {
    method: "POST",
    headers: signedHeaders({ productSlug: SLUG, secret: opts.secret ?? SECRET, method: "POST", pathname: path, rawBody: body }),
    body,
  });
}

const confirmed = (ref: string, extra: Partial<PortalCallback["data"]> = {}): PortalCallback => ({
  event_id: newEventId(),
  type: "payment.confirmed",
  occurred_at: new Date().toISOString(),
  data: {
    external_customer_id: restaurantId,
    bank_reference: ref,
    payment_type: "monthly",
    months_covered: 1,
    billing_month_start: "2030-01",
    amount: 80000,
    ...extra,
  } as never,
});

d("Servd ↔ agent portal", () => {
  let outbox: typeof import("@/server/agent-portal/outbox");
  let route: typeof import("@/app/api/agent-portal/callbacks/route");
  let cron: typeof import("@/server/billing/run-cron");

  beforeAll(async () => {
    outbox = await import("@/server/agent-portal/outbox");
    route = await import("@/app/api/agent-portal/callbacks/route");
    cron = await import("@/server/billing/run-cron");
    await asSuper(async (tx) => {
      const plan = await tx.plan.create({ data: { name: `Test ${stamp}`, priceMonthly: 80000, limits: {} } });
      const r = await tx.restaurant.create({
        data: { name: `Manual ${stamp}`, slug: `manual-${stamp}`, status: "active", billingMode: "manual", planId: plan.id },
      });
      restaurantId = r.id;
      subscriptionId = (
        await tx.subscription.create({
          data: { restaurantId, planId: plan.id, status: "trialing", trialEndsAt: new Date(Date.now() + 86_400_000) },
        })
      ).id;
    });
  });

  beforeEach(async () => {
    // Each test drains only what it queued.
    await asSuper((tx) => tx.productEventOutbox.updateMany({ where: { productSlug: SLUG, status: "pending" }, data: { status: "sent" } }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("the outbox", () => {
    it("delivers a signed event and marks it sent", async () => {
      const id = await queue("customer.signed_up", { external_customer_id: restaurantId, business_name: "B", owner_name: "O", owner_phone: "0917", agent_code: null, plan: null });
      const portal = fakePortal((e: any) => ({ status: 200, json: { event_id: e.event_id, status: "processed" } }));
      const r = await outbox.flushOutbox(10, portal.fetchImpl);
      expect(r).toMatchObject({ configured: true, sent: 1 });
      expect(portal.sent[0]).toMatchObject({ url: "https://agents.test/api/v1/events", verified: true });
      const row = await asSuper((tx) => tx.productEventOutbox.findUnique({ where: { eventId: id } }));
      expect(row).toMatchObject({ status: "sent", portalStatus: "processed" });
    });

    it("keeps retrying with backoff while the portal is down", async () => {
      const id = await queue("customer.cancelled", { external_customer_id: restaurantId });
      const portal = fakePortal(() => ({ status: 503, json: { error: "down" } }));
      expect((await outbox.flushOutbox(10, portal.fetchImpl)).retrying).toBe(1);
      const row = await asSuper((tx) => tx.productEventOutbox.findUnique({ where: { eventId: id } }));
      expect(row?.status).toBe("pending");
      expect(row?.attempts).toBe(1);
      expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      // Not due yet: a second flush does not resend it.
      expect((await outbox.flushOutbox(10, portal.fetchImpl)).retrying).toBe(0);
    });

    it("never sends one event twice from two concurrent drains", async () => {
      await queue("customer.reactivated", { external_customer_id: restaurantId });
      const portal = fakePortal((e: any) => ({ status: 200, json: { event_id: e.event_id, status: "processed" } }));
      const [a, b] = await Promise.all([outbox.flushOutbox(10, portal.fetchImpl), outbox.flushOutbox(10, portal.fetchImpl)]);
      expect(a.sent + b.sent).toBe(1);
      expect(portal.sent).toHaveLength(1);
    });

    it("tells the owner when the portal refuses a duplicate bank reference", async () => {
      const eventId = await manualPayment(`DUP-${stamp}`);
      await asSuper((tx) =>
        enqueueProductEvent(tx, SLUG, { event_id: eventId, type: "payment.submitted", occurred_at: new Date().toISOString(), data: {} }),
      );
      const portal = fakePortal((e: any) => ({ status: 200, json: { event_id: e.event_id, status: "refused", error: "duplicate_bank_reference" } }));
      await outbox.flushOutbox(10, portal.fetchImpl);
      const p = await asSuper((tx) => tx.servdManualPayment.findUnique({ where: { eventId } }));
      expect(p).toMatchObject({ status: "rejected", reason: "That bank reference number has already been used." });
    });

    it("gives up on an event the portal can never accept, and says so", async () => {
      const eventId = await manualPayment(`BAD-${stamp}`);
      await asSuper((tx) =>
        enqueueProductEvent(tx, SLUG, { event_id: eventId, type: "payment.submitted", occurred_at: new Date().toISOString(), data: {} }),
      );
      const portal = fakePortal(() => ({ status: 422, json: { error: "data.amount: Required" } }));
      expect((await outbox.flushOutbox(10, portal.fetchImpl)).failed).toBe(1);
      expect((await asSuper((tx) => tx.productEventOutbox.findUnique({ where: { eventId } })))?.status).toBe("failed");
      expect((await asSuper((tx) => tx.servdManualPayment.findUnique({ where: { eventId } })))?.status).toBe("rejected");
    });
  });

  describe("callbacks", () => {
    it("refuses a callback signed with the wrong secret", async () => {
      const res = await route.POST(callbackRequest(confirmed("X"), { secret: "wrong" }));
      expect(res.status).toBe(401);
    });

    it("payment.confirmed extends coverage and activates; a redelivery changes nothing", async () => {
      const ref = `OK-${stamp}`;
      await manualPayment(ref, { billingMonthStart: new Date("2030-01-01T00:00:00Z"), monthsCovered: 2 });
      const cb = confirmed(ref, { months_covered: 2 });

      const first = await route.POST(callbackRequest(cb));
      expect(await first.json()).toMatchObject({ outcome: "applied" });
      const sub = await asSuper((tx) => tx.subscription.findUnique({ where: { id: subscriptionId } }));
      // Two months from Jan 2030 → paid until 1 Mar 2030 00:00 Manila.
      expect(sub?.currentPeriodEnd?.toISOString()).toBe("2030-02-28T16:00:00.000Z");
      expect(sub?.status).toBe("trialing"); // the trial is still running

      const again = await route.POST(callbackRequest(cb));
      expect(await again.json()).toMatchObject({ outcome: "duplicate" });
    });

    it("payment.confirmed for the activation records activationPaidAt", async () => {
      const ref = `ACT-${stamp}`;
      await manualPayment(ref, { type: "activation", billingMonthStart: null, amount: 50000 });
      await route.POST(callbackRequest(confirmed(ref, { payment_type: "activation", billing_month_start: null, amount: 50000 })));
      const r = await asSuper((tx) => tx.restaurant.findUnique({ where: { id: restaurantId } }));
      expect(r?.activationPaidAt).not.toBeNull();
    });

    it("payment.rejected shows the reason to the owner", async () => {
      const ref = `REJ-${stamp}`;
      await manualPayment(ref);
      await route.POST(callbackRequest({
        event_id: newEventId(), type: "payment.rejected", occurred_at: new Date().toISOString(),
        data: { external_customer_id: restaurantId, bank_reference: ref, reason: "Amount does not match the receipt" },
      }));
      const p = await asSuper((tx) => tx.servdManualPayment.findUnique({ where: { bankReference: ref } }));
      expect(p).toMatchObject({ status: "rejected", reason: "Amount does not match the receipt" });
    });

    it("payment.reversed takes the coverage back", async () => {
      const ref = `REV-${stamp}`;
      await manualPayment(ref, { billingMonthStart: new Date("2030-03-01T00:00:00Z"), monthsCovered: 1 });
      await route.POST(callbackRequest(confirmed(ref, { billing_month_start: "2030-03" })));
      let sub = await asSuper((tx) => tx.subscription.findUnique({ where: { id: subscriptionId } }));
      expect(sub?.currentPeriodEnd?.toISOString()).toBe("2030-03-31T16:00:00.000Z");

      await route.POST(callbackRequest({
        event_id: newEventId(), type: "payment.reversed", occurred_at: new Date().toISOString(),
        data: { external_customer_id: restaurantId, bank_reference: ref, reason: "Bank recalled the transfer" },
      }));
      sub = await asSuper((tx) => tx.subscription.findUnique({ where: { id: subscriptionId } }));
      expect(sub?.currentPeriodEnd?.toISOString()).toBe("2030-02-28T16:00:00.000Z");
    });

    it("contract.signed records the signature date", async () => {
      await route.POST(callbackRequest({
        event_id: newEventId(), type: "contract.signed", occurred_at: new Date().toISOString(),
        data: { external_customer_id: restaurantId, contract_id: "c1", signed_at: "2026-10-06T02:00:00.000Z", minimum_term_ends_at: "2027-01-06T02:00:00.000Z" },
      }));
      const r = await asSuper((tx) => tx.restaurant.findUnique({ where: { id: restaurantId } }));
      expect(r?.contractSignedAt?.toISOString()).toBe("2026-10-06T02:00:00.000Z");
    });
  });

  describe("the daily run", () => {
    it("marks a lapsed manual restaurant past due, then suspends it after the grace, and never invoices it", async () => {
      const now = new Date("2030-03-02T00:00:00Z"); // after coverage ends 1 Mar
      await asSuper((tx) => tx.subscription.update({ where: { id: subscriptionId }, data: { status: "active", trialEndsAt: null } }));
      const s = { manualPastDue: 0, manualSuspended: 0 } as never;
      const sub = () => asSuper((tx) => tx.subscription.findUnique({ where: { id: subscriptionId } }));

      await cron.runManualBilling([{ id: subscriptionId, restaurantId, status: "active", trialEndsAt: null }], now, s);
      expect((await sub())?.status).toBe("past_due");

      const later = new Date("2030-03-20T00:00:00Z");
      await cron.runManualBilling([{ id: subscriptionId, restaurantId, status: "past_due", trialEndsAt: null }], later, s);
      expect((await asSuper((tx) => tx.restaurant.findUnique({ where: { id: restaurantId } })))?.status).toBe("suspended");
      expect(await asSuper((tx) => tx.restaurantInvoice.count({ where: { restaurantId } }))).toBe(0);
    });

    it("a confirmed payment lifts the suspension", async () => {
      const ref = `LIFT-${stamp}`;
      // Cover through a month comfortably in the future.
      await manualPayment(ref, { billingMonthStart: new Date("2099-01-01T00:00:00Z"), monthsCovered: 1 });
      await route.POST(callbackRequest(confirmed(ref, { billing_month_start: "2099-01" })));
      const r = await asSuper((tx) => tx.restaurant.findUnique({ where: { id: restaurantId } }));
      expect(r?.status).toBe("active");
      expect((await asSuper((tx) => tx.subscription.findUnique({ where: { id: subscriptionId } })))?.status).toBe("active");
    });
  });
});
