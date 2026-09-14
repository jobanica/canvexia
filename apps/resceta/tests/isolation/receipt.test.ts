import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { receiveDelivery } from "@/server/pharmacy/receiving";
import { completeSale } from "@/server/pharmacy/sale";
import { voidSale } from "@/server/pharmacy/reversal";
import { receiptFor } from "@/server/pharmacy/receipt";
import { pharmacySettings, updatePharmacySettings } from "@/server/pharmacy/settings";

/**
 * The receipt against a real database.
 *
 * The pure tests prove the arithmetic. What only a database can show is that
 * the printed document agrees with the money that actually changed hands — the
 * till rounds per line, and the receipt is derived from the stored totals, so
 * the two agreeing is a claim about a real transaction rather than about a
 * fixture.
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
const TODAY = new Date();
let partnerId = "";
let pharmacyId = "";
let otherPharmacyId = "";
let staffId = "";

async function makePharmacy(label: string) {
  return asSuper(async (tx) => {
    const pharmacy = await tx.pharmacy.create({
      data: {
        partnerId,
        name: `${label} ${stamp}`,
        slug: `${label.toLowerCase()}-${stamp}`,
        status: "active",
      },
      select: { id: true },
    });
    return pharmacy.id;
  });
}

/** A product priced so the SC arithmetic has something to round. */
async function stockUp(priceCentavos: number, quantity: number) {
  const product = await asSuper((tx) =>
    tx.pharmacyProduct.create({
      data: { pharmacyId, name: `Item ${randomUUID().slice(0, 6)}`, priceCentavos },
      select: { id: true },
    }),
  );
  await receiveDelivery({
    pharmacyId,
    actorStaffId: staffId,
    deliveryRef: randomUUID(),
    canCreateProducts: true,
    lines: [
      {
        productId: product.id,
        lotNumber: "LOT-R",
        expiryDate: "2028-06-30",
        quantity,
        unitCostCentavos: Math.floor(priceCentavos / 2),
      },
    ],
  });
  return product.id;
}

d("the printed receipt", () => {
  beforeAll(async () => {
    partnerId = (
      await asSuper((tx) =>
        tx.partner.create({
          data: {
            name: `Rcpt ${stamp}`,
            email: `rcpt-${stamp}@example.test`,
            status: "approved",
            tier: "operator",
            revenueSharePct: 70,
          },
          select: { id: true },
        }),
      )
    ).id;
    pharmacyId = await makePharmacy("Rcpt");
    otherPharmacyId = await makePharmacy("Other");
    staffId = (
      await asSuper((tx) =>
        tx.pharmacyStaff.create({
          data: {
            pharmacyId,
            authUserId: randomUUID(),
            email: `rcpt-${stamp}@example.test`,
            displayName: "Ana Cruz",
            role: "owner",
          },
          select: { id: true },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      await tx.pharmacy.deleteMany({ where: { id: { in: [pharmacyId, otherPharmacyId] } } });
      await tx.partner.deleteMany({ where: { id: partnerId } });
    });
    await prisma.$disconnect();
  });

  it("prints what the till charged, on an ordinary sale", async () => {
    const pid = await stockUp(11200, 10);
    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: pid, quantity: 2 }],
      tenderedCentavos: 30000,
      soldByStaffId: staffId,
      asOf: TODAY,
    });
    expect(sale.ok).toBe(true);
    if (!sale.ok) return;

    const doc = await receiptFor(pharmacyId, sale.saleId);
    expect(doc).not.toBeNull();
    expect(doc!.receiptNumber).toBe(sale.receiptNumber);
    expect(doc!.summary.at(-1)).toMatchObject({ kind: "due", centavos: sale.totalCentavos });
    expect(doc!.payment.changeCentavos).toBe(30000 - sale.totalCentavos);
    // The dispenser has no relation on the model; it is looked up by id.
    expect(doc!.soldBy).toBe("Ana Cruz");
    expect(doc!.lines[0]).toMatchObject({ lotNumberAtTime: "LOT-R", quantity: 2 });
  });

  it("reconciles an SC sale end to end: VAT box, summary and money taken", async () => {
    // Prices chosen so the per-line rounding actually bites.
    const a = await stockUp(1333, 20);
    const b = await stockUp(799, 20);
    const sale = await completeSale({
      pharmacyId,
      lines: [
        { productId: a, quantity: 3 },
        { productId: b, quantity: 7 },
      ],
      discountType: "sc",
      beneficiaryIdNo: "SC-99887",
      beneficiaryName: "Rosario Dela Cruz",
      tenderedCentavos: 100000,
      soldByStaffId: staffId,
      asOf: TODAY,
    });
    expect(sale.ok).toBe(true);
    if (!sale.ok) return;

    const doc = (await receiptFor(pharmacyId, sale.saleId))!;
    const due = doc.summary.at(-1)!;

    // 1. The printed amount due IS the money taken.
    expect(due.centavos).toBe(sale.totalCentavos);

    // 2. The two statutory deductions add back to the shelf price.
    const deductions = doc.summary
      .filter((r) => r.kind === "deduction")
      .reduce((s, r) => s + r.centavos, 0);
    expect(doc.summary[0].centavos - deductions).toBe(sale.totalCentavos);

    // 3. The discount is shown as 20%, not as the whole reduction.
    const statutoryRow = doc.summary.find((r) => r.label.includes("20%"))!;
    const netOfVatRow = doc.summary.find((r) => r.label === "Total (VAT-exempt)")!;
    const implied = statutoryRow.centavos / netOfVatRow.centavos;
    expect(implied).toBeGreaterThan(0.199);
    expect(implied).toBeLessThan(0.201);

    // 4. The VAT box reconciles, and an SC sale is exempt in full.
    const vat = doc.vat!;
    expect(
      vat.vatableSalesCentavos + vat.vatCentavos + vat.vatExemptCentavos + vat.zeroRatedCentavos,
    ).toBe(sale.totalCentavos);
    expect(vat.vatExemptCentavos).toBe(sale.totalCentavos);
    expect(vat.vatCentavos).toBe(0);

    // 5. The beneficiary is on the document, because the discount is not valid
    //    without them.
    expect(doc.beneficiary).toMatchObject({
      kind: "sc",
      idNo: "SC-99887",
      name: "Rosario Dela Cruz",
    });
  });

  it("marks a voided receipt as voided", async () => {
    const pid = await stockUp(5000, 5);
    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: pid, quantity: 1 }],
      tenderedCentavos: 5000,
      soldByStaffId: staffId,
      asOf: TODAY,
    });
    if (!sale.ok) throw new Error("sale failed");

    expect((await receiptFor(pharmacyId, sale.saleId))!.voided).toBe(false);
    await voidSale({
      pharmacyId,
      saleId: sale.saleId,
      actorStaffId: staffId,
      reason: "Rung up twice",
      asOf: TODAY,
    });
    expect((await receiptFor(pharmacyId, sale.saleId))!.voided).toBe(true);
  });

  it("will not hand another pharmacy's receipt over", async () => {
    // A receipt names a customer's medicines, their lot numbers, and on a
    // statutory sale their ID number. Scoping is the whole argument.
    const pid = await stockUp(2500, 5);
    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: pid, quantity: 1 }],
      tenderedCentavos: 2500,
      asOf: TODAY,
    });
    if (!sale.ok) throw new Error("sale failed");

    expect(await receiptFor(otherPharmacyId, sale.saleId)).toBeNull();
  });

  it("is not an official receipt until the licences are on file, and is after", async () => {
    const pid = await stockUp(1000, 5);
    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: pid, quantity: 1 }],
      tenderedCentavos: 1000,
      asOf: TODAY,
    });
    if (!sale.ok) throw new Error("sale failed");

    const before = (await receiptFor(pharmacyId, sale.saleId))!;
    expect(before.isOfficial).toBe(false);
    expect(before.gaps.map((g) => g.field)).toEqual([
      "tin",
      "address",
      "fdaLtoNumber",
      "prcLicenseNo",
    ]);

    await updatePharmacySettings({
      pharmacyId,
      actorStaffId: staffId,
      displayName: null,
      address: "12 Quimpo Blvd, Davao City",
      phone: "0917 000 0000",
      email: null,
      tin: "123-456-789-00000",
      fdaLtoNumber: "LTO-2026-0001",
      prcLicenseNo: "PRC-0012345",
      vatRatePct: 12,
    });

    const after = (await receiptFor(pharmacyId, sale.saleId))!;
    expect(after.isOfficial).toBe(true);
    expect(after.gaps).toEqual([]);
    expect(after.identity.fdaLtoNumber).toBe("LTO-2026-0001");
  });

  it("records who changed the licence numbers, and what they were", async () => {
    // The question an audit asks is not "did this change" but "what was it
    // before", which a diff of field names cannot answer.
    const settings = await pharmacySettings(pharmacyId);
    expect(settings!.tin).toBe("123-456-789-00000");

    await updatePharmacySettings({
      pharmacyId,
      actorStaffId: staffId,
      displayName: null,
      address: settings!.address,
      phone: settings!.phone,
      email: null,
      tin: "999-999-999-99999",
      fdaLtoNumber: settings!.fdaLtoNumber,
      prcLicenseNo: settings!.prcLicenseNo,
      vatRatePct: 12,
    });

    const log = await asSuper((tx) =>
      tx.auditLog.findFirst({
        where: { entityType: "pharmacy", entityId: pharmacyId },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(log).not.toBeNull();
    expect(log!.action).toBe("pharmacy.settings.update");
    expect(log!.actorStaffId).toBe(staffId);
    expect((log!.before as { tin: string }).tin).toBe("123-456-789-00000");
    expect((log!.after as { tin: string }).tin).toBe("999-999-999-99999");
  });

  it("prints the non-VAT wording instead of a VAT box at a zero rate", async () => {
    await updatePharmacySettings({
      pharmacyId,
      actorStaffId: staffId,
      displayName: null,
      address: "12 Quimpo Blvd, Davao City",
      phone: null,
      email: null,
      tin: "999-999-999-99999",
      fdaLtoNumber: "LTO-2026-0001",
      prcLicenseNo: "PRC-0012345",
      vatRatePct: 0,
    });

    const pid = await stockUp(1000, 5);
    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: pid, quantity: 1 }],
      tenderedCentavos: 1000,
      asOf: TODAY,
    });
    if (!sale.ok) throw new Error("sale failed");

    const doc = (await receiptFor(pharmacyId, sale.saleId))!;
    expect(doc.vat).toBeNull();
    expect(doc.vatRegistered).toBe(false);
    // Still an official receipt — not being VAT-registered is a registration
    // status, not a missing document.
    expect(doc.isOfficial).toBe(true);
  });
});
