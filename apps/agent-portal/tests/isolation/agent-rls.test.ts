import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { asAdmin, asAgent, asSuper, asVerifier, hasDb, prisma } from "./helpers";

/**
 * Agent-portal access, enforced by Postgres.
 *
 * Every read below omits its where clause on purpose: the claim is that the
 * database returns only what the caller may see even when the application
 * forgets to filter.
 */
const d = hasDb ? describe : describe.skip;
const stamp = randomUUID().slice(0, 8);

let productId = "";
let ruleId = "";
let agentA = "";
let agentB = "";
let refA = "";
let refB = "";
let submittedA = "";
let confirmedB = "";
let commissionA = "";

d("agent portal RLS", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const p = await tx.agentProduct.create({
        data: {
          slug: `rls-${stamp}`,
          name: "RLS test",
          credential: { create: { secretEnc: "x", secretHint: "abcd" } },
        },
      });
      productId = p.id;
      const r = await tx.agentCommissionRule.create({
        data: {
          productId, activationFee: 50000, monthlyFee: 80000, activationCommission: 50000,
          tier1Amount: 20000, tier1Months: 6, tier2Amount: 10000, validFrom: new Date("2026-01-01"),
        },
      });
      ruleId = r.id;
      const mk = async (label: string) =>
        (await tx.agent.create({
          data: {
            authUserId: randomUUID(), name: `Agent ${label}`, email: `${label}-${stamp}@example.test`,
            mobile: "639170000000", referralCode: `${label}${stamp}`.toUpperCase().slice(0, 12),
            payoutMethod: "GCash", payoutAccountName: label, payoutAccountNumber: "0917",
            status: "active", agreementAcceptedAt: new Date(), agreementVersion: 1,
          },
        })).id;
      agentA = await mk("a");
      agentB = await mk("b");
      const ref = async (agentId: string, ext: string) =>
        (await tx.agentReferral.create({
          data: {
            productId, externalCustomerId: `${ext}-${stamp}`, businessName: ext, ownerName: ext,
            ownerPhone: "0918", agentId, signedUpAt: new Date(), commissionRuleId: ruleId,
          },
        })).id;
      refA = await ref(agentA, "a");
      refB = await ref(agentB, "b");
      submittedA = (await tx.agentPayment.create({
        data: { referralId: refA, type: "activation", amount: 50000, bankReference: `A-${stamp}` },
      })).id;
      confirmedB = (await tx.agentPayment.create({
        data: { referralId: refB, type: "activation", amount: 50000, bankReference: `B-${stamp}`, status: "confirmed" },
      })).id;
      commissionA = (await tx.agentCommission.create({
        data: {
          agentId: agentA, referralId: refA, paymentId: submittedA, kind: "activation",
          amount: 50000, payableFrom: new Date(), ruleId,
        },
      })).id;
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("an agent", () => {
    it("sees only their own agent row, customers, payments and commission", async () => {
      await asAgent(agentA, async (tx) => {
        const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
        expect(ids(await tx.agent.findMany({ select: { id: true } }))).toEqual([agentA]);
        expect(ids(await tx.agentReferral.findMany({ select: { id: true } }))).toEqual([refA]);
        expect(ids(await tx.agentPayment.findMany({ select: { id: true } }))).toEqual([submittedA]);
        expect(ids(await tx.agentCommission.findMany({ select: { id: true } }))).toEqual([commissionA]);
      });
    });

    it("cannot fetch another agent's customer by primary key", async () => {
      expect(await asAgent(agentA, (tx) => tx.agentReferral.findUnique({ where: { id: refB } }))).toBeNull();
    });

    it("cannot read secrets, events, the audit log or staff", async () => {
      await asAgent(agentA, async (tx) => {
        expect(await tx.agentProductCredential.count()).toBe(0);
        expect(await tx.agentEvent.count()).toBe(0);
        expect(await tx.agentAuditLog.count()).toBe(0);
        expect(await tx.portalStaff.count()).toBe(0);
      });
    });

    it("reads the product catalogue and rules", async () => {
      await asAgent(agentA, async (tx) => {
        expect(await tx.agentProduct.count({ where: { id: productId } })).toBe(1);
        expect(await tx.agentCommissionRule.count({ where: { id: ruleId } })).toBe(1);
      });
    });

    it("cannot change their own payout details directly", async () => {
      const n = await asAgent(agentA, (tx) =>
        tx.agent.updateMany({ data: { payoutAccountNumber: "0999" } }),
      );
      expect(n.count).toBe(0);
    });

    it("may request a payout change for themselves, pending only", async () => {
      await asAgent(agentA, (tx) =>
        tx.agentPayoutDetailChange.create({ data: { agentId: agentA, oldValues: {}, newValues: { n: 1 } } }),
      );
      await expect(
        asAgent(agentA, (tx) =>
          tx.agentPayoutDetailChange.create({
            data: { agentId: agentA, oldValues: {}, newValues: {}, status: "approved", approvedBy: "me" },
          }),
        ),
      ).rejects.toThrow();
      await expect(
        asAgent(agentA, (tx) =>
          tx.agentPayoutDetailChange.create({ data: { agentId: agentB, oldValues: {}, newValues: {} } }),
        ),
      ).rejects.toThrow();
    });

    it("cannot write an audit row in someone else's name", async () => {
      // createMany, as writeAudit does: an agent may write but not read the log.
      await asAgent(agentA, (tx) =>
        tx.agentAuditLog.createMany({ data: { actorType: "agent", actorId: agentA, action: "t", entity: `t-${stamp}` } }),
      );
      await expect(
        asAgent(agentA, (tx) =>
          tx.agentAuditLog.createMany({ data: { actorType: "admin", actorId: agentA, action: "t", entity: `t-${stamp}` } }),
        ),
      ).rejects.toThrow();
      await expect(
        asAgent(agentA, (tx) =>
          tx.agentAuditLog.createMany({ data: { actorType: "agent", actorId: agentB, action: "t", entity: `t-${stamp}` } }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("a verifier", () => {
    it("reads every payment", async () => {
      const ids = await asVerifier((tx) => tx.agentPayment.findMany({ where: { id: { in: [submittedA, confirmedB] } } }));
      expect(ids).toHaveLength(2);
    });

    it("may confirm a submitted payment", async () => {
      const id = await asSuper(async (tx) =>
        (await tx.agentPayment.create({
          data: { referralId: refA, type: "monthly", amount: 80000, bankReference: `V1-${stamp}`, billingMonthStart: new Date("2026-10-01") },
        })).id,
      );
      const n = await asVerifier((tx) =>
        tx.agentPayment.updateMany({ where: { id }, data: { status: "confirmed", reviewedBy: "v", reviewedAt: new Date() } }),
      );
      expect(n.count).toBe(1);
    });

    it("cannot reverse a confirmed payment — that is an admin's", async () => {
      const n = await asVerifier((tx) =>
        tx.agentPayment.updateMany({ where: { id: confirmedB }, data: { status: "reversed" } }),
      );
      expect(n.count).toBe(0);
    });

    it("cannot change the amount while confirming", async () => {
      await expect(
        asVerifier((tx) =>
          tx.agentPayment.update({ where: { id: submittedA }, data: { status: "confirmed", amount: 1 } }),
        ),
      ).rejects.toThrow(/review fields/);
    });

    it("may advance a customer's paid months but not reassign them", async () => {
      await asVerifier((tx) => tx.agentReferral.update({ where: { id: refA }, data: { paidMonths: 1, status: "active" } }));
      await expect(
        asVerifier((tx) => tx.agentReferral.update({ where: { id: refA }, data: { agentId: agentB } })),
      ).rejects.toThrow(/status and paid-month/);
    });

    it("cannot touch settings, secrets or a negative commission", async () => {
      await asVerifier(async (tx) => {
        expect(await tx.agentProductCredential.count()).toBe(0);
        expect((await tx.agentSetting.updateMany({ data: { value: 1 } })).count).toBe(0);
      });
      await expect(
        asVerifier((tx) =>
          tx.agentCommission.create({
            data: { agentId: agentA, referralId: refA, paymentId: submittedA, kind: "reversal", amount: -50000, payableFrom: new Date(), ruleId },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("an admin", () => {
    it("reads every agent-portal table but nothing of the products' own", async () => {
      await asAdmin(async (tx) => {
        expect(await tx.agent.count({ where: { id: { in: [agentA, agentB] } } })).toBe(2);
        expect(await tx.agentProductCredential.count({ where: { productId } })).toBe(1);
        expect(await tx.restaurant.count()).toBe(0);
        expect(await tx.pharmacy.count()).toBe(0);
      });
    });
  });

  describe("the commission ledger", () => {
    it("refuses to change an amount, even for the system", async () => {
      await expect(
        asSuper((tx) => tx.agentCommission.update({ where: { id: commissionA }, data: { amount: 1 } })),
      ).rejects.toThrow(/append-only/);
    });

    it("refuses to delete a row, even for the system", async () => {
      await expect(
        asSuper((tx) => tx.agentCommission.delete({ where: { id: commissionA } })),
      ).rejects.toThrow(/append-only/);
    });

    it("lets the lifecycle columns move", async () => {
      const row = await asSuper((tx) =>
        tx.agentCommission.update({ where: { id: commissionA }, data: { status: "approved" } }),
      );
      expect(row.status).toBe("approved");
    });

    it("keeps the audit log append-only too", async () => {
      const where = { entity: `t-${stamp}` };
      expect(await asSuper((tx) => tx.agentAuditLog.count({ where }))).toBeGreaterThan(0);
      await expect(asSuper((tx) => tx.agentAuditLog.deleteMany({ where }))).rejects.toThrow(/append-only/);
      await expect(
        asSuper((tx) => tx.agentAuditLog.updateMany({ where, data: { action: "rewritten" } })),
      ).rejects.toThrow(/append-only/);
    });
  });
});
