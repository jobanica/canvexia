import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { asSuper, hasDb, prisma } from "./helpers";
import type { SignedInStaff } from "@/server/auth";

/**
 * The money path against a real database, through the real server functions
 * and under the real roles: confirm, reject, reverse, payouts. The pure
 * arithmetic is in tests/unit/commission.test.ts; this is about the
 * transaction — what gets written, what is refused, and who may do it.
 */
const d = hasDb ? describe : describe.skip;
const stamp = randomUUID().slice(0, 8);

const admin: SignedInStaff = { kind: "staff", authUserId: randomUUID(), email: "admin@test", staffId: randomUUID(), role: "admin" };
const verifier: SignedInStaff = { kind: "staff", authUserId: randomUUID(), email: "verifier@test", staffId: randomUUID(), role: "verifier" };

let productId = "";
let ruleA = "";
let templateId = "";
let agentId = "";
let n = 0;

type V = typeof import("@/server/verification");
type P = typeof import("@/server/payouts");
let v: V;
let payouts: P;

async function customer(opts: { agent?: boolean; contract?: boolean; ruleId?: string } = {}) {
  return asSuper(async (tx) => {
    const r = await tx.agentReferral.create({
      data: {
        productId, externalCustomerId: `c${++n}-${stamp}`, businessName: "Biz", ownerName: "O", ownerPhone: "0918",
        agentId: opts.agent === false ? null : agentId, signedUpAt: new Date(), commissionRuleId: opts.ruleId ?? ruleA,
      },
    });
    if (opts.contract !== false) {
      await tx.agentContract.create({
        data: {
          referralId: r.id, templateId, templateVersion: 1, signerName: "O", signerPosition: "Owner", signerPhone: "0918",
          signaturePath: "x.png", signedAt: new Date(), minimumTermEndsAt: new Date(),
        },
      });
    }
    return r.id;
  });
}

async function submit(referralId: string, type: "activation" | "monthly", month?: string, months = 1) {
  return asSuper(async (tx) =>
    (await tx.agentPayment.create({
      data: {
        referralId, type, monthsCovered: months, amount: type === "activation" ? 50000 : 80000 * months,
        bankReference: `REF-${stamp}-${++n}`,
        billingMonthStart: month ? new Date(`${month}-01T00:00:00Z`) : null,
      },
    })).id,
  );
}

const commissions = (referralId: string) =>
  asSuper((tx) => tx.agentCommission.findMany({ where: { referralId }, orderBy: [{ createdAt: "asc" }, { paidMonthNumber: "asc" }] }));
const referral = (id: string) => asSuper((tx) => tx.agentReferral.findUniqueOrThrow({ where: { id } }));

async function setSetting(key: string, value: unknown) {
  await asSuper((tx) => tx.agentSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } }));
}

d("money", () => {
  beforeAll(async () => {
    v = await import("@/server/verification");
    payouts = await import("@/server/payouts");
    await asSuper(async (tx) => {
      productId = (await tx.agentProduct.create({ data: { slug: `money-${stamp}`, name: "Money test" } })).id;
      ruleA = (await tx.agentCommissionRule.create({
        data: { productId, activationFee: 50000, monthlyFee: 80000, activationCommission: 50000, tier1Amount: 20000, tier1Months: 6, tier2Amount: 10000, validFrom: new Date("2026-01-01") },
      })).id;
      templateId = (await tx.agentContractTemplate.create({ data: { kind: "customer", productId, version: 1, body: "T" } })).id;
      agentId = (await tx.agent.create({
        data: {
          authUserId: randomUUID(), name: "Money Agent", email: `m-${stamp}@test`, mobile: "639170000099",
          referralCode: `M${stamp}`.toUpperCase(), payoutMethod: "GCash", payoutAccountName: "MA", payoutAccountNumber: "0917",
          status: "active", agreementAcceptedAt: new Date(), agreementVersion: 1,
        },
      })).id;
    });
  });

  afterEach(async () => {
    await asSuper((tx) => tx.agentSetting.deleteMany({ where: { key: { in: ["activation_commission_release_month", "payout_minimum_amount"] } } }));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("activation confirmed by a verifier: one ₱500 row, customer active, callback queued", async () => {
    const r = await customer();
    const p = await submit(r, "activation");
    expect(await v.confirmPayment(verifier, p)).toEqual({ ok: true });
    const rows = await commissions(r);
    expect(rows.map((c) => [c.kind, c.amount, c.status])).toEqual([["activation", 50000, "approved"]]);
    expect((await referral(r)).status).toBe("active");
    const cb = await asSuper((tx) => tx.agentCallbackOutbox.findMany({ where: { productId, type: "payment.confirmed" } }));
    expect(cb.some((c) => (c.payload as { data: { bank_reference: string } }).data.bank_reference.startsWith(`REF-${stamp}`))).toBe(true);
  });

  it("refuses an activation before the contract is signed", async () => {
    const r = await customer({ contract: false });
    const p = await submit(r, "activation");
    expect(await v.confirmPayment(verifier, p)).toMatchObject({ ok: false, error: expect.stringMatching(/agreement/) });
  });

  it("paid months 1–6 at ₱200 and month 7 at ₱100, across three confirmations crossing the boundary", async () => {
    const r = await customer();
    expect(await v.confirmPayment(verifier, await submit(r, "monthly", "2026-01", 5))).toEqual({ ok: true });
    expect(await v.confirmPayment(verifier, await submit(r, "monthly", "2026-06", 3))).toEqual({ ok: true });
    const rows = await commissions(r);
    expect(rows.map((c) => [c.paidMonthNumber, c.amount])).toEqual([
      [1, 20000], [2, 20000], [3, 20000], [4, 20000], [5, 20000], [6, 20000], [7, 10000], [8, 10000],
    ]);
    expect((await referral(r)).paidMonths).toBe(8);
  });

  it("a skipped month does not advance the count", async () => {
    const r = await customer();
    await v.confirmPayment(verifier, await submit(r, "monthly", "2026-01"));
    await v.confirmPayment(verifier, await submit(r, "monthly", "2026-03")); // February never paid
    expect((await commissions(r)).map((c) => c.paidMonthNumber)).toEqual([1, 2]);
  });

  it("refuses a second confirmed payment for the same customer and billing month", async () => {
    const r = await customer();
    expect(await v.confirmPayment(verifier, await submit(r, "monthly", "2026-04", 2))).toEqual({ ok: true });
    const again = await v.confirmPayment(verifier, await submit(r, "monthly", "2026-05"));
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/already covers 2026-04/) });
    expect((await referral(r)).paidMonths).toBe(2);
  });

  it("refuses to confirm the same payment twice", async () => {
    const r = await customer();
    const p = await submit(r, "monthly", "2026-02");
    await v.confirmPayment(verifier, p);
    expect(await v.confirmPayment(verifier, p)).toMatchObject({ ok: false });
    expect(await commissions(r)).toHaveLength(1);
  });

  it("a rule change does not affect customers who signed up under the old rule", async () => {
    const r = await customer(); // pinned to rule A (₱200)
    await asSuper(async (tx) => {
      await tx.agentCommissionRule.update({ where: { id: ruleA }, data: { validTo: new Date("2026-10-01") } });
      await tx.agentCommissionRule.create({
        data: { productId, activationFee: 50000, monthlyFee: 90000, activationCommission: 60000, tier1Amount: 30000, tier1Months: 3, tier2Amount: 5000, validFrom: new Date("2026-10-01") },
      });
    });
    await v.confirmPayment(verifier, await submit(r, "monthly", "2026-10"));
    expect((await commissions(r)).map((c) => [c.amount, c.ruleId])).toEqual([[20000, ruleA]]);
  });

  it("churn then reactivation keeps the agent and resumes the count", async () => {
    const r = await customer();
    await v.confirmPayment(verifier, await submit(r, "monthly", "2026-01", 2));
    await asSuper((tx) => tx.agentReferral.update({ where: { id: r }, data: { status: "churned" } }));
    await asSuper((tx) => tx.agentReferral.update({ where: { id: r }, data: { status: "lead" } })); // reactivated
    await v.confirmPayment(verifier, await submit(r, "monthly", "2026-09"));
    const after = await referral(r);
    expect(after).toMatchObject({ agentId, paidMonths: 3, status: "active" });
    expect((await commissions(r)).map((c) => c.paidMonthNumber)).toEqual([1, 2, 3]);
  });

  it("activation_commission_release_month = 3 holds the ₱500 until the third paid month", async () => {
    await setSetting("activation_commission_release_month", 3);
    const r = await customer();
    await v.confirmPayment(verifier, await submit(r, "activation"));
    const held = async () => (await commissions(r)).find((c) => c.kind === "activation")!.status;
    expect(await held()).toBe("pending_release");
    await v.confirmPayment(verifier, await submit(r, "monthly", "2026-01", 2));
    expect(await held()).toBe("pending_release");
    await v.confirmPayment(verifier, await submit(r, "monthly", "2026-03"));
    expect(await held()).toBe("approved");
  });

  it("a verifier may reject with a reason but may not reverse", async () => {
    const r = await customer();
    const p1 = await submit(r, "monthly", "2026-01");
    expect(await v.rejectPayment(verifier, p1, "")).toMatchObject({ ok: false });
    expect(await v.rejectPayment(verifier, p1, "Blurry receipt")).toEqual({ ok: true });
    const p2 = await submit(r, "monthly", "2026-02");
    await v.confirmPayment(verifier, p2);
    expect(await v.reversePayment(verifier, p2, "nope")).toMatchObject({ ok: false });
  });

  it("reversal writes matching negative rows and takes the paid months back", async () => {
    const r = await customer();
    const p = await submit(r, "monthly", "2026-01", 2);
    await v.confirmPayment(verifier, p);
    expect(await v.reversePayment(admin, p, "Bank recalled the transfer")).toEqual({ ok: true });
    const rows = await commissions(r);
    expect(rows.map((c) => [c.kind, c.amount, c.status])).toEqual([
      ["monthly", 20000, "reversed"],
      ["monthly", 20000, "reversed"],
      ["reversal", -20000, "reversed"],
      ["reversal", -20000, "reversed"],
    ]);
    expect((await referral(r)).paidMonths).toBe(0);
    expect(rows.reduce((s, c) => s + c.amount, 0)).toBe(0);
  });

  it("reversal of commission already paid out comes off the next payout, and a negative balance carries", async () => {
    // A fresh agent, so the payout totals are this test's alone.
    const solo = await asSuper(async (tx) =>
      (await tx.agent.create({
        data: {
          authUserId: randomUUID(), name: "Solo", email: `solo-${stamp}@test`, mobile: "639170000098",
          referralCode: `S${stamp}`.toUpperCase(), payoutMethod: "Maya", payoutAccountName: "S", payoutAccountNumber: "0918",
          status: "active", agreementAcceptedAt: new Date(), agreementVersion: 1,
        },
      })).id,
    );
    const r = await asSuper(async (tx) => {
      const ref = await tx.agentReferral.create({
        data: { productId, externalCustomerId: `solo-${stamp}`, businessName: "S", ownerName: "S", ownerPhone: "0918", agentId: solo, signedUpAt: new Date(), commissionRuleId: ruleA },
      });
      await tx.agentContract.create({
        data: { referralId: ref.id, templateId, templateVersion: 1, signerName: "S", signerPosition: "Owner", signerPhone: "0918", signaturePath: "x", signedAt: new Date(), minimumTermEndsAt: new Date() },
      });
      return ref.id;
    });
    await setSetting("payout_minimum_amount", 0);

    const act = await submit(r, "activation");
    await v.confirmPayment(verifier, act, new Date("2026-01-10T00:00:00Z"));
    // Payable from 1 Feb; February's payout picks it up.
    const gen = await payouts.generatePayouts(admin, "2026-02");
    expect(gen).toMatchObject({ ok: true });
    const payout = await asSuper((tx) => tx.agentPayout.findFirstOrThrow({ where: { agentId: solo } }));
    expect(payout.total).toBe(50000);
    expect(await payouts.markPayoutPaid(admin, payout.id, "GC-1")).toMatchObject({ ok: false }); // not approved yet
    await payouts.approvePayout(admin, payout.id);
    expect(await payouts.markPayoutPaid(admin, payout.id, "GC-REF-1")).toEqual({ ok: true });
    expect((await commissions(r))[0].status).toBe("paid");

    await v.reversePayment(admin, act, "Chargeback", new Date("2026-02-20T00:00:00Z"));
    const rows = await commissions(r);
    expect(rows.map((c) => [c.kind, c.amount, c.status])).toEqual([
      ["activation", 50000, "paid"],
      ["reversal", -50000, "approved"],
    ]);

    // March: the agent owes ₱500 and has nothing else — no payout, carried.
    await payouts.generatePayouts(admin, "2026-03");
    expect(await asSuper((tx) => tx.agentPayout.count({ where: { agentId: solo } }))).toBe(1);
    expect(rows.find((c) => c.kind === "reversal")?.payoutId).toBeNull();
  });

  it("generating a period twice does not pay anyone twice", async () => {
    await setSetting("payout_minimum_amount", 0);
    const r = await customer();
    await v.confirmPayment(verifier, await submit(r, "monthly", "2025-05"), new Date("2025-05-10T00:00:00Z"));
    await payouts.generatePayouts(admin, "2025-06");
    await payouts.generatePayouts(admin, "2025-06");
    expect(await asSuper((tx) => tx.agentPayout.count({ where: { agentId, period: new Date("2025-06-01T00:00:00Z") } }))).toBe(1);
  });

  it("a customer with no agent pays and advances, earning nobody anything", async () => {
    const r = await customer({ agent: false });
    expect(await v.confirmPayment(verifier, await submit(r, "monthly", "2026-01"))).toEqual({ ok: true });
    expect(await commissions(r)).toEqual([]);
    expect((await referral(r)).paidMonths).toBe(1);
  });
});
