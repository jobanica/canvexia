import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SettingsInput, parseStorefrontFlags } from "@/lib/pharmacy/settings-input";

/**
 * WAVE 7 — receipt and printer settings, loyalty settings, the public shop
 * page and the orders it produces.
 *
 * THE LOAD-BEARING RULE: an online order does NOT move stock. It is a request;
 * the sale is rung up at the counter like any other. That keeps ONE stock path
 * — the one that already allocates FEFO, snapshots cost and writes the ledger.
 * A second path deducting stock on "order placed" would be a second set of
 * rules to keep in agreement with the first, and they would drift.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

const base = {
  displayName: "",
  address: "",
  phone: "",
  email: "",
  tin: "",
  fdaLtoNumber: "",
  prcLicenseNo: "",
  vatRatePct: "12",
  receiptPaperMm: "58",
  receiptHeader: "",
  receiptFooter: "",
  birPermitNo: "",
  posSerialNo: "",
  loyaltyPointsPerPeso: "",
  loyaltyCentavosPerPoint: "",
  storefrontBlurb: "",
};

describe("the new settings", () => {
  it("accepts only the two real paper widths", () => {
    expect(SettingsInput.parse({ ...base, receiptPaperMm: "80" }).receiptPaperMm).toBe(80);
    // Anything else is a typo, and a receipt laid out for the wrong width
    // wraps every line.
    expect(SettingsInput.parse({ ...base, receiptPaperMm: "72" }).receiptPaperMm).toBe(58);
    expect(SettingsInput.parse({ ...base, receiptPaperMm: "" }).receiptPaperMm).toBe(58);
  });

  it("treats a blank loyalty rate as off rather than refusing it", () => {
    // Unlike the VAT rate, zero here is the SAFE state, so it defaults.
    const r = SettingsInput.parse(base);
    expect(r.loyaltyPointsPerPeso).toBe(0);
    expect(r.loyaltyCentavosPerPoint).toBe(0);
  });

  it("tells an unticked checkbox apart from a section that was not on screen", () => {
    // An unticked checkbox is ABSENT from the FormData, so without the marker
    // "not sent" and "the user turned it off" are indistinguishable — and a
    // partial save would quietly close the shop.
    expect(
      parseStorefrontFlags({
        sectionPresent: null,
        storefrontOn: null,
        storefrontAcceptsDelivery: null,
      }),
    ).toEqual({});

    expect(
      parseStorefrontFlags({
        sectionPresent: "1",
        storefrontOn: null,
        storefrontAcceptsDelivery: null,
      }),
    ).toEqual({ storefrontOn: false, storefrontAcceptsDelivery: false });

    expect(
      parseStorefrontFlags({
        sectionPresent: "1",
        storefrontOn: "on",
        storefrontAcceptsDelivery: "on",
      }),
    ).toEqual({ storefrontOn: true, storefrontAcceptsDelivery: true });
  });

  it("leaves a field alone when the form did not carry it", () => {
    // `updatePharmacySettings` drops undefined before writing.
    const r = SettingsInput.parse({
      displayName: "",
      address: "",
      phone: "",
      email: "",
      tin: "",
      fdaLtoNumber: "",
      prcLicenseNo: "",
      vatRatePct: "12",
    });
    expect(r.receiptPaperMm).toBeUndefined();
    expect(r.loyaltyPointsPerPeso).toBeUndefined();
  });

  it("still refuses a blank VAT rate", () => {
    // The one field where a blank cannot mean zero — it would drop the VAT box
    // off every receipt and change the SC/PWD arithmetic.
    expect(SettingsInput.safeParse({ ...base, vatRatePct: "" }).success).toBe(false);
  });
});

describe("a partial settings write cannot blank what it does not send", () => {
  it("drops undefined fields before writing", () => {
    // A form covering the statutory identity and nothing else must not switch
    // the loyalty programme off and close the storefront.
    const settings = src("server/pharmacy/settings.ts");
    expect(settings).toContain("Object.entries(rest).filter(([, v]) => v !== undefined)");
  });
});

describe("the public shop page", () => {
  const store = src("server/pharmacy/storefront.ts");

  it("never lists a prescription-only item", () => {
    // Dispensing one without a prescription is an offence, and a public page
    // that takes an order for one is an invitation to commit it.
    expect(store).toContain("requiresPrescription: false");
    // Twice: once when listing, once when an order names an id.
    expect((store.match(/requiresPrescription: false/g) ?? []).length).toBe(2);
  });

  it("puts the filter in the query, not the template", () => {
    // A template filter is one refactor away from being dropped.
    const page = src("app/shop/[slug]/page.tsx");
    expect(page).not.toContain("requiresPrescription");
  });

  it("hides the shop when it is off or the pharmacy is not active", () => {
    // A suspended pharmacy must not take orders it cannot fill, and a page
    // cached in somebody's browser must not keep taking them after it is
    // switched off.
    expect(store).toContain('if (!row || !row.storefrontOn || row.status !== "active") return null;');
  });

  it("resolves the pharmacy from the slug, never from the form", () => {
    // A pharmacy id in a public form body would let anybody file an order
    // against any pharmacy — the one cross-tenant hole a public form opens.
    const actions = src("app/shop/[slug]/actions.ts");
    expect(actions).toContain("await shopBySlug(slug)");
    expect(actions).not.toMatch(/formData\.get\("pharmacyId"\)/);
  });

  it("offers delivery only where the pharmacy offers it", () => {
    const actions = src("app/shop/[slug]/actions.ts");
    expect(actions).toContain('fulfilment === "delivery" && shop.acceptsDelivery');
  });

  it("publishes in-stock as a yes/no, never a count", () => {
    // "3 left" invites somebody to order three and be told there is one — the
    // counter is selling the same shelf in real time.
    expect(store).toContain("inStock: onHand(p.batches as AllocatableBatch[], now) > 0");
  });

  it("snapshots the price onto the order line", () => {
    // So a price change afterwards does not alter what the customer was quoted.
    expect(store).toContain("nameAtTime: p.name");
    expect(store).toContain("unitPriceCentavos: p.priceCentavos");
  });

  it("shows the order number before anything can unmount it", () => {
    // It is the only thing the customer can quote on the phone.
    const form = src("app/shop/[slug]/ShopForm.tsx");
    const done = form.indexOf('if (state.status === "done")');
    const list = form.indexOf("const available =");
    expect(done).toBeGreaterThan(-1);
    expect(done).toBeLessThan(list);
  });

  it("renders no app chrome for a customer with no account", () => {
    const page = src("app/shop/[slug]/page.tsx");
    expect(page).not.toContain("AppShell");
  });
});

describe("an order never moves stock", () => {
  const store = src("server/pharmacy/storefront.ts");

  it("writes no batch, no movement and no sale", () => {
    expect(store).not.toContain("pharmacyBatch.update");
    expect(store).not.toContain("pharmacyStockMovement.create");
    expect(store).not.toContain("pharmacySale.create");
  });

  it("walks the status forwards only", () => {
    // Without this the status is whatever the last button pressed said, which
    // is not a record of anything.
    expect(store).toContain('placed: ["confirmed", "cancelled"]');
    expect(store).toContain("completed: []");
    expect(store).toContain("cancelled: []");
    expect(store).toContain("if (!allowed.includes(input.to))");
  });

  it("says out loud that completing means it was rung up", () => {
    const card = src("app/orders/OrderCard.tsx");
    expect(card).toContain("Collected and rung up");
  });
});
