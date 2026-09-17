import { describe, it, expect } from "vitest";
import { codeAt } from "../support/source";

/**
 * A PHARMACY CAN BE SWITCHED OFF, NOT ONLY ON.
 *
 * `activatePharmacy` has existed since the vertical shipped. Nothing could
 * reverse it: `setStatus` refused anything that was not Servd, so a partner
 * could activate a pharmacy and never switch one off again — a one-way door on
 * the single control that makes non-payment answerable, on accounts the partner
 * bills in cash off this system.
 *
 * The mechanism was already built on the other side. Resceta's counter refuses
 * to ring up a sale when `pharmacies.status` is not "active", and its shell
 * says so on every page. Only the lever was missing.
 */

const action = codeAt("src/server/partners/merchant-actions.ts");
const page = codeAt("src/app/(platform)/partner/merchants/[key]/page.tsx");

describe("the lever exists for both axes", () => {
  it("accepts a pharmacy", () => {
    expect(action).toContain('productId !== "servd" && productId !== "pharmacy"');
  });

  it("writes to the pharmacy table, not the restaurant one", () => {
    expect(action).toContain("tx.pharmacy.updateMany");
  });

  it("names the product rather than inferring it", () => {
    // A product this code has never heard of has no table to write to, and
    // defaulting to one would switch off the wrong business.
    expect(action).toContain('productId === "pharmacy"');
    expect(action).not.toMatch(/productId \?\?\s*"servd"/);
  });

  it("keeps ownership in the WHERE clause on both", () => {
    // A pharmacy belonging to another partner matches zero rows rather than
    // being checked and then switched off.
    expect(action.split("where: { id: merchantId, partnerId: who.partnerId }").length - 1).toBe(2);
  });

  it("still insists on a reason to suspend", () => {
    expect(action).toContain("Say why");
  });

  it("records which axis the id belongs to", () => {
    // Two products can hold the same uuid shape; an audit reader should not
    // have to guess which table to look in.
    expect(action).toContain('entityType: productId === "pharmacy" ? "pharmacy" : "merchant"');
  });
});

describe("the control is offered on a pharmacy's page", () => {
  it("no longer hides behind a Servd-only check", () => {
    expect(page).toContain('merchant.productId === "servd" || merchant.productId === "pharmacy"');
  });

  it("says what suspension actually does to a pharmacy", () => {
    // Not the restaurant sentence. A pharmacy has no ordering page, and what
    // stops is the counter.
    expect(page).toContain("Their counter refuses to ring up a sale");
    expect(page).toContain("Stock, batches and past receipts are untouched");
  });

  it("is still gated on the permission that names the action", () => {
    expect(page).toContain('partnerAllows(partner, "merchants.suspend")');
    expect(action).toContain('requireWritablePartner("merchants.suspend")');
  });
});
