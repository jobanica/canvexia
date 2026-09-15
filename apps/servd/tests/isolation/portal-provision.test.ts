import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { provisionMerchantForPartner, provisionableProducts } from "@/server/products";
import { listPartnerPharmacies, activatePharmacy } from "@/server/partners/pharmacies";

/**
 * A partner opening a pharmacy from the CANVEXIA portal (D36).
 *
 * The point of this file is that the portal — which runs in apps/servd — can
 * create a Resceta merchant at all. Until the shared `provisionPharmacyIn`
 * moved into @servd/db, this process had no pharmacy adapter to dispatch to and
 * `provisionableProducts()` did not list one.
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
let partnerId = "", otherId = "", suspendedId = "";

async function makePartner(label: string, status: string) {
  return (await asSuper((tx) => tx.partner.create({
    data: {
      name: `${label} ${stamp}`, email: `${label}-${stamp}@example.test`,
      status, tier: "operator", revenueSharePct: 70,
    },
    select: { id: true },
  }))).id;
}

d("provisioning a pharmacy from the partner portal", () => {
  beforeAll(async () => {
    partnerId = await makePartner("pp", "approved");
    otherId = await makePartner("ppother", "approved");
    suspendedId = await makePartner("ppsusp", "suspended");
  });

  afterAll(async () => {
    const ids = [partnerId, otherId, suspendedId];
    await asSuper(async (tx) => {
      await tx.pharmacy.deleteMany({ where: { partnerId: { in: ids } } });
      await tx.auditLog.deleteMany({ where: { partnerId: { in: ids } } });
      await tx.partner.deleteMany({ where: { id: { in: ids } } });
    });
    await prisma.$disconnect();
  });

  it("lists pharmacy as provisionable in THIS process", () => {
    // The regression that matters: apps/servd registering the adapter is the
    // whole difference between the portal offering Resceta and not.
    expect(provisionableProducts()).toContain("pharmacy");
    expect(provisionableProducts()).toContain("servd");
  });

  it("creates a pharmacy the partner then owns and can see through RLS", async () => {
    const out = await provisionMerchantForPartner("pharmacy", partnerId, {
      name: `Botica ${stamp}`,
      address: "12 Quimpo Blvd, Davao City",
      extra: { actorEmail: `pp-${stamp}@example.test` },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.slug).toMatch(/^botica-/);

    // Read back with no where clause of its own — the policy is the guarantee.
    const rows = await listPartnerPharmacies(partnerId);
    const row = rows.find((r) => r.id === out.result.merchantId);
    expect(row).toBeDefined();
    expect(row!.status).toBe("pending");
    expect(row!.hasLto).toBe(false);
  });

  it("starts pending, and cannot be activated until the licence is on file", async () => {
    // The two halves of D36 meeting: created inactive here, switched on only
    // after the merchant records its LTO.
    const rows = await listPartnerPharmacies(partnerId);
    const fresh = rows[0];
    expect(fresh.activation.ok).toBe(false);

    const refused = await activatePharmacy({
      partnerId, pharmacyId: fresh.id, actorEmail: "pp@example.test",
    });
    expect(refused.ok).toBe(false);

    await asSuper((tx) => tx.pharmacy.update({
      where: { id: fresh.id }, data: { fdaLtoNumber: "LTO-2026-9999" },
    }));
    const allowed = await activatePharmacy({
      partnerId, pharmacyId: fresh.id, actorEmail: "pp@example.test",
    });
    expect(allowed.ok).toBe(true);
  });

  it("names the partner who created it on the audit row", async () => {
    const log = await asSuper((tx) => tx.auditLog.findFirst({
      where: { partnerId, action: "pharmacy.provision" },
      orderBy: { createdAt: "desc" },
    }));
    expect(log).not.toBeNull();
    expect(log!.actorType).toBe("partner");
    expect(log!.actorEmail).toBe(`pp-${stamp}@example.test`);
    expect((log!.after as { productId: string }).productId).toBe("pharmacy");
  });

  it("does NOT leak the new pharmacy to another partner", async () => {
    const mine = await listPartnerPharmacies(partnerId);
    const theirs = await listPartnerPharmacies(otherId);
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs.map((r) => r.id)).not.toContain(mine[0].id);
  });

  it("refuses a suspended partner before it dispatches", async () => {
    // Checked in provisionMerchantForPartner rather than in the adapter, so a
    // partner cannot keep signing merchants while a dispute is open.
    const out = await provisionMerchantForPartner("pharmacy", suspendedId, {
      name: `Nope ${stamp}`,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toMatch(/suspended/i);
    expect(await listPartnerPharmacies(suspendedId)).toEqual([]);
  });

  it("refuses a product that is not live", async () => {
    const out = await provisionMerchantForPartner("laundry", partnerId, { name: "x" });
    expect(out).toMatchObject({ ok: false, reason: "product_not_live" });
  });

  it("gives colliding names distinct slugs", async () => {
    const a = await provisionMerchantForPartner("pharmacy", partnerId, { name: `Dupe ${stamp}` });
    const b = await provisionMerchantForPartner("pharmacy", partnerId, { name: `Dupe ${stamp}` });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.result.slug).not.toBe(b.result.slug);
  });
});
