import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { signedHeaders } from "@servd/core/agent-kit";
import { asSuper, hasDb, prisma } from "./helpers";

/**
 * The product API end to end: real route handlers, real signatures, real
 * database. What a product built on the connection kit will actually hit.
 */
process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");

const d = hasDb ? describe : describe.skip;
const stamp = randomUUID().slice(0, 8);
const SECRET = `cvx_test_${stamp}`;
const SLUG = `t${stamp}`;
const BASE = "https://agents.test";

let productId = "";
let ruleId = "";
let activeCode = "";
let activeAgentId = "";
let pendingCode = "";
const AGENT_MOBILE = "639171112222";

type Routes = {
  events: typeof import("@/app/api/v1/events/route");
  codes: typeof import("@/app/api/v1/codes/[code]/route");
  ingest: typeof import("@/server/events/ingest");
};
let routes: Routes;

function signed(method: string, path: string, body: string, opts: { secret?: string; slug?: string; now?: Date } = {}) {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...signedHeaders({
        productSlug: opts.slug ?? SLUG,
        secret: opts.secret ?? SECRET,
        method,
        pathname: path,
        rawBody: body,
        now: opts.now,
      }),
    },
    body: method === "GET" ? undefined : body,
  });
}

async function send(event: object, opts?: Parameters<typeof signed>[3]) {
  const body = JSON.stringify(event);
  const res = await routes.events.POST(signed("POST", "/api/v1/events", body, opts));
  return { status: res.status, json: await res.json() };
}

async function lookup(code: string) {
  const res = await routes.codes.GET(signed("GET", `/api/v1/codes/${code}`, ""), {
    params: Promise.resolve({ code }),
  });
  return { status: res.status, json: await res.json() };
}

let n = 0;
const evt = (type: string, data: object, occurredAt = new Date()) => ({
  event_id: `evt-${stamp}-${++n}`,
  type,
  occurred_at: occurredAt.toISOString(),
  data,
});
const signup = (ext: string, extra: object = {}) =>
  evt("customer.signed_up", {
    external_customer_id: ext,
    business_name: `Biz ${ext}`,
    owner_name: "Owner",
    owner_phone: "09189998888",
    ...extra,
  });
const payment = (ext: string, ref: string, extra: object = {}) =>
  evt("payment.submitted", {
    external_customer_id: ext,
    type: "activation",
    months_covered: 1,
    amount: 50000,
    bank_reference: ref,
    ...extra,
  });

const referral = (ext: string) =>
  asSuper((tx) =>
    tx.agentReferral.findUnique({
      where: { productId_externalCustomerId: { productId, externalCustomerId: ext } },
    }),
  );

d("product API", () => {
  beforeAll(async () => {
    const { encryptSecret } = await import("@/server/crypto");
    routes = {
      events: await import("@/app/api/v1/events/route"),
      codes: await import("@/app/api/v1/codes/[code]/route"),
      ingest: await import("@/server/events/ingest"),
    };
    await asSuper(async (tx) => {
      const p = await tx.agentProduct.create({
        data: {
          slug: SLUG,
          name: "API test",
          credential: { create: { secretEnc: encryptSecret(SECRET), secretHint: SECRET.slice(-4) } },
        },
      });
      productId = p.id;
      ruleId = (
        await tx.agentCommissionRule.create({
          data: {
            productId, activationFee: 50000, monthlyFee: 80000, activationCommission: 50000,
            tier1Amount: 20000, tier1Months: 6, tier2Amount: 10000, validFrom: new Date("2026-01-01"),
          },
        })
      ).id;
      const mk = async (status: "active" | "pending", mobile: string) => {
        const code = `Q${stamp}${status[0]}`.toUpperCase();
        const a = await tx.agent.create({
          data: {
            authUserId: randomUUID(), name: `Ana ${status}`, email: `${status}-${stamp}@example.test`, mobile,
            referralCode: code, payoutMethod: "GCash", payoutAccountName: "Ana", payoutAccountNumber: "0917",
            status, agreementAcceptedAt: new Date(), agreementVersion: 1,
          },
        });
        return { code, id: a.id };
      };
      const active = await mk("active", AGENT_MOBILE);
      activeCode = active.code;
      activeAgentId = active.id;
      pendingCode = (await mk("pending", "639170000001")).code;
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("authentication", () => {
    it("refuses a bad signature, a stale one, and an unknown product — all as 401", async () => {
      const e = signup(`auth-${stamp}`);
      expect((await send(e, { secret: "wrong" })).status).toBe(401);
      expect((await send(e, { now: new Date(Date.now() - 6 * 60_000) })).status).toBe(401);
      expect((await send(e, { slug: "nosuchproduct" })).status).toBe(401);
      expect(await referral(`auth-${stamp}`)).toBeNull();
    });

    it("refuses an inactive product", async () => {
      await asSuper((tx) => tx.agentProduct.update({ where: { id: productId }, data: { status: "inactive" } }));
      try {
        expect((await lookup(activeCode)).status).toBe(401);
      } finally {
        await asSuper((tx) => tx.agentProduct.update({ where: { id: productId }, data: { status: "active" } }));
      }
    });
  });

  describe("GET /api/v1/codes/{code}", () => {
    it("names the agent behind an active code, case-insensitively", async () => {
      const r = await lookup(activeCode.toLowerCase());
      expect(r).toEqual({ status: 200, json: { code: activeCode, valid: true, active: true, agent_name: "Ana active" } });
    });

    it("says a pending agent's code is valid but not active, without naming them", async () => {
      expect((await lookup(pendingCode)).json).toEqual({ code: pendingCode, valid: true, active: false, agent_name: null });
    });

    it("says an unknown code is invalid", async () => {
      expect((await lookup("ZZZZZZ")).json).toMatchObject({ valid: false, active: false });
    });
  });

  describe("POST /api/v1/events", () => {
    it("attaches an active agent's code at signup and pins the current rule", async () => {
      const ext = `c1-${stamp}`;
      const r = await send(signup(ext, { agent_code: activeCode.toLowerCase() }));
      expect(r).toMatchObject({ status: 200, json: { status: "processed" } });
      const ref = await referral(ext);
      expect(ref).toMatchObject({ agentId: activeAgentId, commissionRuleId: ruleId, status: "lead", paidMonths: 0 });
    });

    it("is idempotent on event_id: a duplicate answers 200 and changes nothing", async () => {
      const ext = `dup-${stamp}`;
      const e = signup(ext);
      expect((await send(e)).json.status).toBe("processed");
      const second = await send(e);
      expect(second).toMatchObject({ status: 200, json: { status: "duplicate" } });
      expect(await asSuper((tx) => tx.agentEvent.count({ where: { eventId: e.event_id } }))).toBe(1);
    });

    it("does not attach a pending agent's code, but keeps what was typed", async () => {
      const ext = `c2-${stamp}`;
      await send(signup(ext, { agent_code: pendingCode }));
      expect(await referral(ext)).toMatchObject({ agentId: null, reportedAgentCode: pendingCode });
    });

    it("does not attach a self-referral", async () => {
      const ext = `self-${stamp}`;
      await send(signup(ext, { agent_code: activeCode, owner_phone: "0917 111 2222" }));
      expect((await referral(ext))?.agentId).toBeNull();
    });

    it("accepts a signup with no code — an existing customer keeps working", async () => {
      const ext = `nocode-${stamp}`;
      expect((await send(signup(ext))).json.status).toBe("processed");
      expect((await referral(ext))?.agentId).toBeNull();
    });

    it("never moves the agent on a repeated signup", async () => {
      const ext = `c1-${stamp}`;
      await send(signup(ext, { agent_code: pendingCode }));
      expect((await referral(ext))?.agentId).toBe(activeAgentId);
    });

    it("holds a payment for an unknown customer, then processes it when the signup arrives", async () => {
      const ext = `ooo-${stamp}`;
      const pay = payment(ext, `OOO-${stamp}`);
      expect((await send(pay)).json.status).toBe("pending");
      const ev = await asSuper((tx) => tx.agentEvent.findUnique({ where: { eventId: pay.event_id } }));
      expect(ev).toMatchObject({ processedAt: null, error: "waiting_for_customer" });

      expect((await send(signup(ext, { agent_code: activeCode }))).json.status).toBe("processed");

      const after = await asSuper((tx) => tx.agentEvent.findUnique({ where: { eventId: pay.event_id } }));
      expect(after?.processedAt).not.toBeNull();
      expect(after?.error).toBeNull();
      const ref = await referral(ext);
      const payments = await asSuper((tx) => tx.agentPayment.findMany({ where: { referralId: ref!.id } }));
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({ status: "submitted", amount: 50000, bankReference: `OOO-${stamp}` });
    });

    it("refuses a bank reference that has been used before, in any product", async () => {
      const ext = `bank-${stamp}`;
      await send(signup(ext));
      expect((await send(payment(ext, `DUP-${stamp}`))).json.status).toBe("processed");
      const again = await send(payment(ext, `DUP-${stamp}`, { type: "monthly", billing_month_start: "2026-11" }));
      expect(again).toMatchObject({ status: 200, json: { status: "refused", error: "duplicate_bank_reference" } });
    });

    it("stores billing_month_start as the first of the month", async () => {
      const ext = `month-${stamp}`;
      await send(signup(ext));
      await send(payment(ext, `MON-${stamp}`, { type: "monthly", months_covered: 3, billing_month_start: "2026-11" }));
      const p = await asSuper((tx) => tx.agentPayment.findUnique({ where: { bankReference: `MON-${stamp}` } }));
      expect(p?.billingMonthStart?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
      expect(p?.monthsCovered).toBe(3);
    });

    it("churn then reactivation keeps the agent and the paid-month count", async () => {
      const ext = `churn-${stamp}`;
      await send(signup(ext, { agent_code: activeCode }));
      await asSuper((tx) =>
        tx.agentReferral.update({
          where: { productId_externalCustomerId: { productId, externalCustomerId: ext } },
          data: { paidMonths: 4, status: "active" },
        }),
      );
      await send(evt("customer.cancelled", { external_customer_id: ext, reason: "closed for renovation" }));
      expect(await referral(ext)).toMatchObject({ status: "churned", agentId: activeAgentId, paidMonths: 4 });
      await send(evt("customer.reactivated", { external_customer_id: ext }));
      expect(await referral(ext)).toMatchObject({ status: "lead", agentId: activeAgentId, paidMonths: 4 });
    });

    it("answers 422 for a malformed event and does not store it", async () => {
      const bad = { event_id: `bad-${stamp}`, type: "payment.submitted", occurred_at: new Date().toISOString(), data: { external_customer_id: "x" } };
      expect((await send(bad)).status).toBe(422);
      expect(await asSuper((tx) => tx.agentEvent.count({ where: { eventId: bad.event_id } }))).toBe(0);
    });

    it("answers 400 for a body that is not JSON", async () => {
      const res = await routes.events.POST(signed("POST", "/api/v1/events", "{nope"));
      expect(res.status).toBe(400);
    });
  });

  describe("the retry sweep", () => {
    it("processes an event left waiting by a race", async () => {
      const ext = `race-${stamp}`;
      // Simulate the race: the signup committed, but a payment that arrived
      // concurrently was stored as waiting and missed the replay.
      await send(signup(ext));
      const ev = payment(ext, `RACE-${stamp}`);
      await asSuper((tx) =>
        tx.agentEvent.create({
          data: {
            eventId: ev.event_id, productId, type: ev.type, payload: ev,
            externalCustomerId: ext, error: "waiting_for_customer",
          },
        }),
      );
      const r = await routes.ingest.retryWaitingEvents();
      expect(r.processed).toBeGreaterThanOrEqual(1);
      expect(await asSuper((tx) => tx.agentPayment.count({ where: { bankReference: `RACE-${stamp}` } }))).toBe(1);
    });
  });
});
