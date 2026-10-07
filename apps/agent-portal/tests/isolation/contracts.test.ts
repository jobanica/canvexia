import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { SIGNATURE_PNG } from "./fixtures";
import { asSuper, hasDb, prisma } from "./helpers";

/**
 * Contract signing end to end against a real database: the PDF is generated
 * for real (pdf-lib), storage is a map.
 */
process.env.CONTRACT_LINK_SECRET ??= randomBytes(32).toString("hex");
const stored = new Map<string, Uint8Array>();
vi.mock("@/server/storage", () => ({
  PRIVATE_BUCKET: "test",
  putPrivateObject: async (path: string, bytes: Uint8Array) => {
    stored.set(path, bytes);
  },
  signedUrl: async (path: string) => `https://storage.test/${path}`,
}));

const d = hasDb ? describe : describe.skip;
const stamp = randomUUID().slice(0, 8);
let referralId = "";
let productId = "";
type C = typeof import("@/server/contracts");
let contracts: C;

const input = {
  signerName: "Ana Reyes",
  signerPosition: "Owner",
  signerPhone: "0917 123 4567",
  signatureDataUrl: `data:image/png;base64,${SIGNATURE_PNG}`,
  agreed: true,
  ip: "203.0.113.9",
  userAgent: "test",
};

d("contract signing", () => {
  beforeAll(async () => {
    contracts = await import("@/server/contracts");
    await asSuper(async (tx) => {
      productId = (await tx.agentProduct.create({ data: { slug: `sign-${stamp}`, name: "Sign test" } })).id;
      const rule = await tx.agentCommissionRule.create({
        data: { productId, activationFee: 50000, monthlyFee: 80000, activationCommission: 50000, tier1Amount: 20000, tier1Months: 6, tier2Amount: 10000, validFrom: new Date("2026-01-01") },
      });
      await tx.agentContractTemplate.create({
        data: { kind: "customer", productId, version: 1, active: true, body: "{{business_name}} agrees to pay {{monthly_fee}} monthly for at least {{minimum_term_months}} months." },
      });
      referralId = (await tx.agentReferral.create({
        data: { productId, externalCustomerId: `s-${stamp}`, businessName: "Mango Grill", ownerName: "Ana", ownerPhone: "0917", signedUpAt: new Date(), commissionRuleId: rule.id },
      })).id;
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("shows the active template filled with the customer's own fees and term", async () => {
    const { url } = contracts.linkFor(referralId);
    const token = url.split("/sign/")[1];
    const view = await contracts.signingView(token);
    expect(view).toMatchObject({ state: "ready", templateVersion: 1 });
    expect(view.state === "ready" && view.body).toBe("Mango Grill agrees to pay ₱800.00 monthly for at least 3 months.");
  });

  it("signs: stores a PDF and the signature, writes the contract, queues contract.signed", async () => {
    const token = contracts.linkFor(referralId).url.split("/sign/")[1];
    const now = new Date("2026-10-06T02:00:00Z");
    expect(await contracts.signContract(token, input, now)).toEqual({ ok: true });

    const c = await asSuper((tx) => tx.agentContract.findFirstOrThrow({ where: { referralId } }));
    expect(c).toMatchObject({ signerName: "Ana Reyes", templateVersion: 1, ip: "203.0.113.9" });
    expect(c.minimumTermEndsAt.toISOString()).toBe("2027-01-06T02:00:00.000Z");
    const pdf = stored.get(c.pdfPath!);
    expect(Buffer.from(pdf!.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(stored.has(c.signaturePath)).toBe(true);

    const cb = await asSuper((tx) => tx.agentCallbackOutbox.findFirst({ where: { productId, type: "contract.signed" } }));
    expect(cb?.payload).toMatchObject({ data: { external_customer_id: `s-${stamp}`, contract_id: c.id } });
  });

  it("refuses to sign twice", async () => {
    const token = contracts.linkFor(referralId).url.split("/sign/")[1];
    expect(await contracts.signContract(token, input)).toMatchObject({ ok: false, error: expect.stringMatching(/already/) });
    expect(await contracts.signingView(token)).toMatchObject({ state: "signed" });
  });

  it("refuses without agreement, without a signature, and with an expired link", async () => {
    const token = contracts.linkFor(referralId).url.split("/sign/")[1];
    expect(await contracts.signContract(token, { ...input, agreed: false })).toMatchObject({ ok: false });
    expect(await contracts.signContract(token, { ...input, signatureDataUrl: "" })).toMatchObject({ ok: false });
    const old = contracts.linkFor(referralId, new Date("2020-01-01")).url.split("/sign/")[1];
    expect(await contracts.signContract(old, input)).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
  });
});
