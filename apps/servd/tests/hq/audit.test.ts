import { describe, it, expect, vi } from "vitest";
import {
  writeAudit,
  writePartnerAudit,
  writeHqAudit,
} from "@/server/audit/log";

/**
 * The audit helper, without a database.
 *
 * Worth testing this way because the thing that matters is WHAT GETS PUT IN THE
 * ROW, and there are three callers with three different ideas of who the actor
 * is. Until H1 there was one helper that required a restaurantId, so six partner
 * modules hand-rolled `tx.auditLog.create` instead — and those copies had
 * already drifted on which fields they set. A fake client is enough to pin that.
 */
function fakeTx() {
  const create = vi.fn().mockResolvedValue({});
  return { tx: { auditLog: { create } } as never, create };
}

describe("writeAudit", () => {
  it("still takes a bare restaurant id, as every existing caller passes", async () => {
    const { tx, create } = fakeTx();
    await writeAudit(tx, "rest-1", { action: "order.void", entityType: "order" });
    expect(create.mock.calls[0][0].data).toMatchObject({
      restaurantId: "rest-1",
      partnerId: null,
      actorType: "merchant",
      action: "order.void",
    });
  });

  it("defaults actorType to merchant with no partner, and partner with one", async () => {
    // A row with no actorType written before the column existed is a merchant
    // action by construction. This keeps that meaning rather than writing null.
    const a = fakeTx();
    await writeAudit(a.tx, { restaurantId: "rest-1" }, { action: "x", entityType: "y" });
    expect(a.create.mock.calls[0][0].data.actorType).toBe("merchant");

    const b = fakeTx();
    await writeAudit(b.tx, { partnerId: "p-1" }, { action: "x", entityType: "y" });
    expect(b.create.mock.calls[0][0].data.actorType).toBe("partner");
  });

  it("swallows a failed write rather than blocking the change it describes", async () => {
    // Deliberate, and only for this function: it guards a merchant's till. A
    // shop that cannot void an order because audit_logs is mid-migration is an
    // outage in a restaurant.
    const create = vi.fn().mockRejectedValue(new Error("relation does not exist"));
    const tx = { auditLog: { create } } as never;
    await expect(
      writeAudit(tx, "rest-1", { action: "order.void", entityType: "order" }),
    ).resolves.toBeUndefined();
  });
});

describe("writePartnerAudit", () => {
  it("writes a partner row with no restaurant", async () => {
    const { tx, create } = fakeTx();
    await writePartnerAudit(tx, "p-1", {
      actorEmail: "sales@partner.test",
      action: "team.invite",
      entityType: "partner_invite",
      after: { email: "new@partner.test", role: "support" },
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      restaurantId: null,
      partnerId: "p-1",
      actorType: "partner",
      actorEmail: "sales@partner.test",
      action: "team.invite",
    });
  });

  it("lets the lead form say the actor was the system, not the partner", async () => {
    // Nobody at the partner did this: a member of the public filled in the
    // operator's own lead form. Recording it as a partner action would put a
    // name on something nobody did.
    const { tx, create } = fakeTx();
    await writePartnerAudit(tx, "p-1", {
      actorType: "system",
      action: "prospect.lead_form",
      entityType: "prospect",
    });
    expect(create.mock.calls[0][0].data.actorType).toBe("system");
  });

  it("THROWS where writeAudit swallows", async () => {
    // The whole reason this is a separate function. Nothing it guards is a
    // till: these are seats being granted, prices being set and merchants
    // changing hands. A mutation that landed with no audit row is worse than
    // one that did not land — and it preserves what the six hand-rolled copies
    // already did, since a bare create inside each module's try/catch already
    // failed the operation.
    const create = vi.fn().mockRejectedValue(new Error("relation does not exist"));
    const tx = { auditLog: { create } } as never;
    await expect(
      writePartnerAudit(tx, "p-1", { action: "team.invite", entityType: "partner_invite" }),
    ).rejects.toThrow();
  });
});

describe("writeHqAudit", () => {
  it("records the partner the action was ABOUT, not the actor", async () => {
    // HQ has no partner. partnerId is set so the partner-detail Activity tab —
    // which filters on it — actually shows every action taken on that partner.
    const { tx, create } = fakeTx();
    await writeHqAudit(tx, {
      partnerId: "p-2",
      restaurantId: "rest-9",
      actorEmail: "hq@canvexia.test",
      action: "merchant.reassigned",
      entityType: "restaurant",
      entityId: "rest-9",
      before: { partnerId: "p-1" },
      after: { partnerId: "p-2" },
    });
    expect(create.mock.calls[0][0].data).toMatchObject({
      partnerId: "p-2",
      restaurantId: "rest-9",
      actorType: "hq",
      actorEmail: "hq@canvexia.test",
    });
  });

  it("throws, for the same reason as the partner helper", async () => {
    const create = vi.fn().mockRejectedValue(new Error("relation does not exist"));
    const tx = { auditLog: { create } } as never;
    await expect(
      writeHqAudit(tx, { action: "hq.login", entityType: "platform_admin" }),
    ).rejects.toThrow();
  });
});
