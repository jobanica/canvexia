import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { newEventId, signedHeaders, verifyRequest, SIGNATURE_HEADERS } from "@servd/core/agent-kit";

/**
 * Resceta on the connection kit, against a real database: self-signup creates
 * a pending pharmacy under the house partner and queues customer.signed_up;
 * the outbox delivers it signed; callbacks record payments once.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;
const prisma = new PrismaClient();
const stamp = randomUUID().slice(0, 8);
const SLUG = `pharmacy-${stamp}`;
const SECRET = `cvx_rx_${stamp}`;
const HOUSE = `house-${stamp}@example.test`;
process.env.AGENT_PORTAL_URL = "https://agents.test";
process.env.AGENT_PORTAL_PRODUCT_SLUG = SLUG;
process.env.AGENT_PORTAL_SECRET = SECRET;
process.env.HOUSE_PARTNER_EMAIL = HOUSE;

function asSuper<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

let pharmacyId = "";

d("Resceta ↔ agent portal", () => {
  let signup: typeof import("@/server/agent-portal/self-signup");
  let outbox: typeof import("@/server/agent-portal/outbox");
  let route: typeof import("@/app/api/agent-portal/callbacks/route");

  beforeAll(async () => {
    signup = await import("@/server/agent-portal/self-signup");
    outbox = await import("@/server/agent-portal/outbox");
    route = await import("@/app/api/agent-portal/callbacks/route");
    await asSuper((tx) => tx.partner.create({ data: { name: "House", email: HOUSE, status: "approved", tier: "operator", revenueSharePct: 70 } }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("self-signup: a pending pharmacy under the house partner, its owner, and the signup event", async () => {
    const r = await signup.signUpPharmacy({
      authUserId: randomUUID(), email: `owner-${stamp}@example.test`, pharmacyName: `Botika ${stamp}`,
      ownerName: "Liza", phone: "09171234567", agentCode: " abc-234 ",
    });
    expect(r.ok).toBe(true);
    pharmacyId = r.ok ? r.pharmacyId : "";
    const p = await asSuper((tx) => tx.pharmacy.findUniqueOrThrow({ where: { id: pharmacyId }, include: { staff: true } }));
    expect(p.status).toBe("pending"); // the licence check still decides dispensing
    expect(p.staff.map((s) => s.role)).toEqual(["owner"]);
    const ev = await asSuper((tx) => tx.productEventOutbox.findFirstOrThrow({ where: { productSlug: SLUG } }));
    expect(ev.payload).toMatchObject({ type: "customer.signed_up", data: { external_customer_id: pharmacyId, agent_code: "ABC234" } });
  });

  it("refuses self-signup when the house partner is missing", async () => {
    process.env.HOUSE_PARTNER_EMAIL = "nobody@example.test";
    try {
      const r = await signup.signUpPharmacy({ authUserId: randomUUID(), email: `x-${stamp}@t.test`, pharmacyName: "X", ownerName: "X", phone: "0917", agentCode: null });
      expect(r.ok).toBe(false);
    } finally {
      process.env.HOUSE_PARTNER_EMAIL = HOUSE;
    }
  });

  it("delivers the queued event signed with Resceta's own secret", async () => {
    let verified = false;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const h = new Headers(init.headers as Record<string, string>);
      verified = verifyRequest({
        secret: SECRET, timestamp: h.get(SIGNATURE_HEADERS.timestamp), signature: h.get(SIGNATURE_HEADERS.signature),
        method: "POST", pathname: new URL(url).pathname, rawBody: String(init.body),
      }).ok && h.get(SIGNATURE_HEADERS.product) === SLUG;
      return new Response(JSON.stringify({ status: "processed" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect((await outbox.flushOutbox(10, fetchImpl)).sent).toBe(1);
    expect(verified).toBe(true);
  });

  it("applies payment.confirmed for the activation once, and contract.signed", async () => {
    await asSuper((tx) =>
      tx.rescetaManualPayment.create({
        data: { pharmacyId, type: "activation", amount: 50000, bankReference: `RX-${stamp}`, eventId: newEventId() },
      }),
    );
    const send = (cb: object) => {
      const body = JSON.stringify(cb);
      const path = "/api/agent-portal/callbacks";
      return route.POST(new Request(`https://resceta.test${path}`, {
        method: "POST",
        headers: signedHeaders({ productSlug: SLUG, secret: SECRET, method: "POST", pathname: path, rawBody: body }),
        body,
      }));
    };
    const confirmed = {
      event_id: newEventId(), type: "payment.confirmed", occurred_at: new Date().toISOString(),
      data: { external_customer_id: pharmacyId, bank_reference: `RX-${stamp}`, payment_type: "activation", months_covered: 1, billing_month_start: null, amount: 50000 },
    };
    expect(await (await send(confirmed)).json()).toMatchObject({ outcome: "applied" });
    expect(await (await send(confirmed)).json()).toMatchObject({ outcome: "duplicate" });
    await send({
      event_id: newEventId(), type: "contract.signed", occurred_at: new Date().toISOString(),
      data: { external_customer_id: pharmacyId, contract_id: "c", signed_at: "2026-10-06T00:00:00.000Z", minimum_term_ends_at: "2027-01-06T00:00:00.000Z" },
    });
    const p = await asSuper((tx) => tx.pharmacy.findUniqueOrThrow({ where: { id: pharmacyId } }));
    expect(p.activationPaidAt).not.toBeNull();
    expect(p.contractSignedAt?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(p.status).toBe("pending"); // paying does not license a pharmacy
  });
});
