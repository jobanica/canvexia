import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { listPharmacies, activatePharmacyAsHq } from "@/server/pharmacies/hq";

/**
 * HQ switching on a pharmacy, against a real database (D36's rule, HQ's
 * button since the partner portal was retired — D38).
 *
 * The pure test covers the rule. This covers the write: the licence check is
 * applied to what is in the row at the moment of the click, the audit row is
 * written with it, and nothing happens twice.
 *
 * Skips without DATABASE_URL.
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
let withLto = "", noLto = "", suspended = "";

async function makePharmacy(label: string, lto: string | null, status = "pending") {
  return (await asSuper((tx) => tx.pharmacy.create({
    data: { name: `${label} ${stamp}`, slug: `${label}-${stamp}`, status, fdaLtoNumber: lto },
    select: { id: true },
  }))).id;
}

const status = (id: string) =>
  asSuper((tx) => tx.pharmacy.findUniqueOrThrow({ where: { id }, select: { status: true } })).then((r) => r.status);

d("HQ activating a pharmacy", () => {
  beforeAll(async () => {
    withLto = await makePharmacy("hqlto", "LTO-2026-0001");
    noLto = await makePharmacy("hqnolto", null);
    suspended = await makePharmacy("hqsusp", "LTO-2026-0003", "suspended");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists pharmacies with whether each can be activated", async () => {
    const rows = await listPharmacies();
    expect(rows.find((r) => r.id === withLto)?.activation.ok).toBe(true);
    expect(rows.find((r) => r.id === noLto)?.activation.ok).toBe(false);
  });

  it("activates a pending pharmacy once the licence is on file, and audits it", async () => {
    expect(await activatePharmacyAsHq({ pharmacyId: withLto, actorEmail: "owner@canvexia.test" })).toMatchObject({ ok: true });
    expect(await status(withLto)).toBe("active");

    const log = await asSuper((tx) => tx.auditLog.findFirst({
      where: { entityType: "pharmacy", entityId: withLto, action: "pharmacy.activate" },
    }));
    expect(log).toMatchObject({ actorType: "hq", actorEmail: "owner@canvexia.test" });
    expect(log!.reason).toContain("LTO-2026-0001");
    expect(log!.before).toEqual({ status: "pending" });
    expect(log!.after).toEqual({ status: "active" });
  });

  it("refuses while no licence is on file", async () => {
    const out = await activatePharmacyAsHq({ pharmacyId: noLto, actorEmail: "owner@canvexia.test" });
    expect(out).toMatchObject({ ok: false, message: expect.stringMatching(/Licence to Operate/i) });
    expect(await status(noLto)).toBe("pending");
  });

  it("refuses to undo a suspension by activating", async () => {
    expect(await activatePharmacyAsHq({ pharmacyId: suspended, actorEmail: "owner@canvexia.test" })).toMatchObject({ ok: false });
    expect(await status(suspended)).toBe("suspended");
  });

  it("refuses to activate twice", async () => {
    expect(await activatePharmacyAsHq({ pharmacyId: withLto, actorEmail: "owner@canvexia.test" })).toMatchObject({ ok: false });
  });

  it("says not found for an unknown id", async () => {
    expect(await activatePharmacyAsHq({ pharmacyId: randomUUID(), actorEmail: "x" })).toMatchObject({
      ok: false, message: expect.stringMatching(/not found/i),
    });
  });
});
