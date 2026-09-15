import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { listPartnerPharmacies, activatePharmacy } from "@/server/partners/pharmacies";

/**
 * A partner switching on a pharmacy, against a real database.
 *
 * The pure test covers the rule. What only a database can show is that the
 * rule is reached through a policy: a partner naming another partner's
 * pharmacy id must not activate it, and must not learn it exists.
 *
 * Skips without DATABASE_URL. Must not run as a superuser.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;

function asSuper<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

const stamp = randomUUID().slice(0, 8);
let alphaId = "", betaId = "";
let alphaPharmacy = "", alphaNoLto = "", betaPharmacy = "";

async function makePartner(label: string) {
  return (await asSuper((tx) => tx.partner.create({
    data: {
      name: `${label} ${stamp}`, email: `${label}-${stamp}@example.test`,
      status: "approved", tier: "operator", revenueSharePct: 70,
    },
    select: { id: true },
  }))).id;
}

async function makePharmacy(partnerId: string, label: string, lto: string | null) {
  return (await asSuper((tx) => tx.pharmacy.create({
    data: {
      partnerId, name: `${label} ${stamp}`, slug: `${label}-${stamp}`,
      status: "pending", fdaLtoNumber: lto,
    },
    select: { id: true },
  }))).id;
}

d("a partner activating a pharmacy", () => {
  beforeAll(async () => {
    alphaId = await makePartner("alpha");
    betaId = await makePartner("beta");
    alphaPharmacy = await makePharmacy(alphaId, "alphaph", "LTO-2026-0001");
    alphaNoLto = await makePharmacy(alphaId, "alphanolto", null);
    betaPharmacy = await makePharmacy(betaId, "betaph", "LTO-2026-0002");
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      await tx.pharmacy.deleteMany({ where: { partnerId: { in: [alphaId, betaId] } } });
      await tx.auditLog.deleteMany({ where: { partnerId: { in: [alphaId, betaId] } } });
      await tx.partner.deleteMany({ where: { id: { in: [alphaId, betaId] } } });
    });
    await prisma.$disconnect();
  });

  it("lists only its own pharmacies, with no where clause of its own to trust", async () => {
    const rows = await listPartnerPharmacies(alphaId);
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([alphaPharmacy, alphaNoLto].sort());
    expect(ids).not.toContain(betaPharmacy);
  });

  it("activates its own pending pharmacy once the licence is on file", async () => {
    const before = await listPartnerPharmacies(alphaId);
    expect(before.find((r) => r.id === alphaPharmacy)?.status).toBe("pending");

    const out = await activatePharmacy({
      partnerId: alphaId, pharmacyId: alphaPharmacy, actorEmail: "alpha@example.test",
    });
    expect(out.ok).toBe(true);

    const row = await asSuper((tx) =>
      tx.pharmacy.findUnique({ where: { id: alphaPharmacy }, select: { status: true } }));
    expect(row!.status).toBe("active");
  });

  it("writes an audit row naming who did it and on what basis", async () => {
    // A status change on a regulated merchant that is not attributable to a
    // person is the one outcome this must not produce.
    const log = await asSuper((tx) => tx.auditLog.findFirst({
      where: { entityType: "pharmacy", entityId: alphaPharmacy, action: "pharmacy.activate" },
      orderBy: { createdAt: "desc" },
    }));
    expect(log).not.toBeNull();
    expect(log!.actorType).toBe("partner");
    expect(log!.partnerId).toBe(alphaId);
    expect(log!.actorEmail).toBe("alpha@example.test");
    expect(log!.reason).toContain("LTO-2026-0001");
    expect((log!.before as { status: string }).status).toBe("pending");
    expect((log!.after as { status: string }).status).toBe("active");
  });

  it("REFUSES another partner's pharmacy, and does not admit it exists", async () => {
    const out = await activatePharmacy({
      partnerId: alphaId, pharmacyId: betaPharmacy, actorEmail: "alpha@example.test",
    });
    expect(out).toMatchObject({ ok: false });
    if (out.ok) return;
    // "not found", not "not yours" — probing ids should not be a directory.
    expect(out.message).toMatch(/not found/i);

    const row = await asSuper((tx) =>
      tx.pharmacy.findUnique({ where: { id: betaPharmacy }, select: { status: true } }));
    expect(row!.status).toBe("pending");
  });

  it("refuses its own pharmacy while no licence is on file", async () => {
    const out = await activatePharmacy({
      partnerId: alphaId, pharmacyId: alphaNoLto, actorEmail: "alpha@example.test",
    });
    expect(out).toMatchObject({ ok: false });
    if (out.ok) return;
    expect(out.message).toMatch(/Licence to Operate/i);

    const row = await asSuper((tx) =>
      tx.pharmacy.findUnique({ where: { id: alphaNoLto }, select: { status: true } }));
    expect(row!.status).toBe("pending");
  });

  it("refuses to activate twice", async () => {
    const out = await activatePharmacy({
      partnerId: alphaId, pharmacyId: alphaPharmacy, actorEmail: "alpha@example.test",
    });
    expect(out).toMatchObject({ ok: false });
  });
});
