import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import {
  deliverEvent,
  lookupAgentCode,
  newEventId,
  requestSigningLink,
  uploadReceipt,
  verifyCallback,
  type AgentPortalConfig,
  type PortalCallback,
} from "@servd/core/agent-kit";
import { SIGNATURE_PNG } from "./fixtures";
import { asSuper, hasDb, prisma } from "./helpers";
import type { SignedInStaff } from "@/server/auth";

/**
 * THE END-TO-END TEST the brief asks for:
 *
 *   agent applies → admin approves → a customer signs up through the product
 *   with the agent's code → signs the contract → submits a receipt → admin
 *   confirms → commission appears → payout is generated and marked paid.
 *
 * The product side is played by the real connection kit — the same calls
 * Servd makes (lookupAgentCode, deliverEvent, requestSigningLink,
 * uploadReceipt) — with its HTTP routed straight into the portal's real route
 * handlers. Callbacks go to a fake product endpoint that verifies them with
 * verifyCallback, as Servd's route does. Servd's own half (outbox, callback
 * application, billing) is tested in apps/servd/tests/agent-portal.
 */
process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");
process.env.CONTRACT_LINK_SECRET ??= randomBytes(32).toString("hex");
process.env.NEXT_PUBLIC_APP_URL = "https://agents.test";
vi.mock("@/server/storage", () => ({
  PRIVATE_BUCKET: "test",
  putPrivateObject: async () => {},
  signedUrl: async (path: string) => `https://storage.test/${path}`,
}));

const d = hasDb ? describe : describe.skip;
const stamp = randomUUID().slice(0, 8);
const SECRET = `cvx_e2e_${stamp}`;
const config: AgentPortalConfig = { baseUrl: "https://agents.test", productSlug: `e2e-${stamp}`, secret: SECRET };
const CALLBACK_URL = "https://servd.test/api/agent-portal/callbacks";
const admin: SignedInStaff = { kind: "staff", authUserId: randomUUID(), email: "owner@canvexia.test", staffId: randomUUID(), role: "admin" };

const received: PortalCallback[] = [];
let router: typeof fetch;

d("end to end: apply → refer → sign → pay → confirm → commission → payout", () => {
  beforeAll(async () => {
    const events = await import("@/app/api/v1/events/route");
    const receipts = await import("@/app/api/v1/receipts/route");
    const codes = await import("@/app/api/v1/codes/[code]/route");
    const links = await import("@/app/api/v1/contracts/links/route");
    const { encryptSecret } = await import("@/server/crypto");

    router = (async (input: string, init: RequestInit) => {
      const url = new URL(input);
      const req = new Request(url, init as RequestInit);
      if (url.origin === "https://servd.test") {
        // The product's callback endpoint.
        const v = verifyCallback(config, req, String(init.body));
        if (!v.ok) return new Response("{}", { status: v.status });
        received.push(v.callback);
        return Response.json({ outcome: "applied" });
      }
      if (url.pathname === "/api/v1/events") return events.POST(req);
      if (url.pathname === "/api/v1/receipts") return receipts.POST(req);
      if (url.pathname === "/api/v1/contracts/links") return links.POST(req);
      const code = url.pathname.match(/^\/api\/v1\/codes\/(.+)$/);
      if (code) return codes.GET(req, { params: Promise.resolve({ code: code[1] }) });
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    await asSuper(async (tx) => {
      const p = await tx.agentProduct.create({
        data: {
          slug: config.productSlug, name: "Servd (e2e)", signupUrl: "https://servd.test/signup", callbackUrl: CALLBACK_URL,
          credential: { create: { secretEnc: encryptSecret(SECRET), secretHint: SECRET.slice(-4) } },
        },
      });
      await tx.agentCommissionRule.create({
        data: { productId: p.id, activationFee: 50000, monthlyFee: 80000, activationCommission: 50000, tier1Amount: 20000, tier1Months: 6, tier2Amount: 10000, validFrom: new Date("2020-01-01") },
      });
      await tx.agentContractTemplate.create({
        data: { kind: "customer", productId: p.id, version: 1, active: true, body: "{{business_name}} subscribes to {{product_name}} at {{monthly_fee}} a month, minimum {{minimum_term_months}} months." },
      });
      // Applications need a published agent agreement; publish one if none.
      const agreement = await tx.agentContractTemplate.findFirst({ where: { kind: "agent", productId: null, active: true } });
      if (!agreement) {
        await tx.agentContractTemplate.create({ data: { kind: "agent", productId: null, version: 9000 + Math.floor(Math.random() * 999), active: true, body: "Agent agreement (test)." } });
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("runs the whole programme", async () => {
    const agents = await import("@/server/agents");
    const { signContract } = await import("@/server/contracts");
    const { confirmPayment } = await import("@/server/verification");
    const { flushCallbacks } = await import("@/server/callbacks");
    const payouts = await import("@/server/payouts");

    // 1. An agent applies.
    const agreement = await agents.activeAgentAgreement();
    const applied = await agents.createApplication(
      { id: randomUUID(), email: `juan-${stamp}@example.test` },
      { name: "Juan Dela Cruz", mobile: "639171119999", payoutMethod: "GCash", payoutAccountName: "Juan Dela Cruz", payoutAccountNumber: "09171119999" },
      agreement!.version,
    );
    expect(applied.ok).toBe(true);
    const agentId = applied.ok ? applied.agentId : "";
    const { referralCode } = await asSuper((tx) => tx.agent.findUniqueOrThrow({ where: { id: agentId } }));

    // A pending agent's code does not attach yet.
    expect(await lookupAgentCode(config, referralCode, router)).toMatchObject({ valid: true, active: false });

    // 2. An admin approves.
    expect(await agents.changeAgentStatus(admin, agentId, "approve")).toEqual({ ok: true });
    expect(await lookupAgentCode(config, referralCode.toLowerCase(), router)).toMatchObject({ active: true, agent_name: "Juan Dela Cruz" });

    // 3. A restaurant signs up through the product with the code.
    const restaurantId = randomUUID();
    const signup = await deliverEvent(config, {
      event_id: newEventId(), type: "customer.signed_up", occurred_at: new Date().toISOString(),
      data: { external_customer_id: restaurantId, business_name: "Mango Grill", owner_name: "Ana Reyes", owner_phone: "09185550000", agent_code: referralCode, plan: null },
    }, router);
    expect(signup).toMatchObject({ kind: "delivered", response: { status: "processed" } });

    // 4. The owner signs the subscription agreement.
    const link = await requestSigningLink(config, restaurantId, router);
    expect(link?.url).toMatch(/^https:\/\/agents\.test\/sign\//);
    const signed = await signContract(link!.url.split("/sign/")[1], {
      signerName: "Ana Reyes", signerPosition: "Owner", signerPhone: "09185550000",
      signatureDataUrl: `data:image/png;base64,${SIGNATURE_PNG}`, agreed: true, ip: "203.0.113.1", userAgent: "e2e",
    });
    expect(signed).toEqual({ ok: true });

    // 5. They pay by QR and submit the receipt.
    const upload = await uploadReceipt(config, new Uint8Array(Buffer.from(SIGNATURE_PNG, "base64")), "image/png", router);
    expect(upload.ok).toBe(true);
    const bankRef = `BPI-E2E-${stamp}`;
    const submitted = await deliverEvent(config, {
      event_id: newEventId(), type: "payment.submitted", occurred_at: new Date().toISOString(),
      data: { external_customer_id: restaurantId, type: "activation", months_covered: 1, billing_month_start: null, amount: 50000, bank_reference: bankRef, receipt_path: upload.ok ? upload.receiptPath : null },
    }, router);
    expect(submitted).toMatchObject({ kind: "delivered", response: { status: "processed" } });

    // 6. An admin confirms it from the queue.
    const payment = await asSuper((tx) => tx.agentPayment.findUniqueOrThrow({ where: { bankReference: bankRef } }));
    expect(payment.status).toBe("submitted");
    expect(await confirmPayment(admin, payment.id, new Date("2026-03-10T03:00:00Z"))).toEqual({ ok: true });

    // 7. The commission appears for the agent — and only the agent.
    const rows = await asSuper((tx) => tx.agentCommission.findMany({ where: { paymentId: payment.id } }));
    expect(rows.map((r) => [r.agentId, r.kind, r.amount, r.status])).toEqual([[agentId, "activation", 50000, "approved"]]);

    // The product hears about both, signed with its own secret. The inline
    // flush after each decision already tried the real network (servd.test
    // does not resolve), failed, and backed off — which is the retry working.
    // Bring them due again and deliver through the router.
    const pending = await asSuper((tx) =>
      tx.agentCallbackOutbox.findMany({ where: { product: { slug: config.productSlug } }, select: { status: true, attempts: true } }),
    );
    expect(pending.every((c) => c.status === "pending" && c.attempts >= 1)).toBe(true);
    await asSuper((tx) =>
      tx.agentCallbackOutbox.updateMany({ where: { product: { slug: config.productSlug } }, data: { nextAttemptAt: new Date() } }),
    );
    await flushCallbacks(50, router);
    const mine = received.filter((c) => c.data.external_customer_id === restaurantId).map((c) => c.type).sort();
    expect(mine).toEqual(["contract.signed", "payment.confirmed"]);

    // 8. April's payout is generated, approved and marked paid.
    const gen = await payouts.generatePayouts(admin, "2026-04");
    expect(gen.ok).toBe(true);
    const payout = await asSuper((tx) => tx.agentPayout.findFirstOrThrow({ where: { agentId } }));
    expect(payout).toMatchObject({ total: 50000, status: "draft", method: "GCash · Juan Dela Cruz · 09171119999" });
    expect(await payouts.approvePayout(admin, payout.id)).toEqual({ ok: true });
    expect(await payouts.markPayoutPaid(admin, payout.id, "GCASH-778899")).toEqual({ ok: true });

    const after = await asSuper((tx) => tx.agentCommission.findFirstOrThrow({ where: { paymentId: payment.id } }));
    expect(after).toMatchObject({ status: "paid", payoutId: payout.id });
    const done = await asSuper((tx) => tx.agentPayout.findUniqueOrThrow({ where: { id: payout.id } }));
    expect(done).toMatchObject({ status: "paid", referenceNumber: "GCASH-778899", paidBy: admin.email });
  });
});
