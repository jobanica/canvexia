import { describe, it, expect } from "vitest";
import { permissionDefault, type PartnerUserRole } from "@servd/core";
import { codeAt } from "../support/source";

/**
 * Suspending a merchant: the partner's only lever.
 *
 * A partner-sold account is billed in cash off this system
 * (`Subscription.billedExternally`), so the daily cron never duns it and never
 * switches it off — Servd cannot know whether the restaurant paid. Until now
 * that left the person who DOES know with nothing: a shop could stop paying its
 * partner and keep every feature indefinitely.
 */
const action = codeAt("src/server/partners/merchant-actions.ts");
const page = codeAt("src/app/(platform)/partner/merchants/[key]/page.tsx");
const ui = codeAt("src/components/partner/MerchantSuspend.tsx");

describe("who may switch a business off", () => {
  it("is admin and ops_manager, not sales or support", () => {
    // Sales opens accounts; support answers for them. Neither should be able to
    // stop a restaurant trading.
    for (const role of ["admin", "ops_manager"] as PartnerUserRole[]) {
      expect(permissionDefault(role, "merchants.suspend"), role).toBe(true);
    }
    for (const role of ["sales", "support"] as PartnerUserRole[]) {
      expect(permissionDefault(role, "merchants.suspend"), role).toBe(false);
    }
  });

  it("uses the A7 permission that NAMES this action, not the legacy bundle", () => {
    // `merchants.manage` is one fixed capability covering plan changes, trials,
    // suspension and invoices. `merchants.suspend` is partner-editable, so an
    // operator can take exactly this off a seat without taking the rest.
    expect(action).toContain('requireWritablePartner("merchants.suspend")');
    expect(page).toContain('partnerAllows(partner, "merchants.suspend")');
    expect(action).not.toContain("merchants.manage");
  });
});

describe("it cannot reach another partner's merchant", () => {
  it("scopes the write by partnerId in the WHERE clause", () => {
    // Not a read-then-write: a merchant belonging to somebody else has to match
    // zero rows, rather than being found and then checked.
    expect(action).toContain("where: { id: merchantId, partnerId: who.partnerId }");
    expect(action).toContain("updateMany");
    expect(action).toContain("if (hit.count === 0) return false;");
  });
});

describe("a suspension is explainable and reversible", () => {
  it("refuses to suspend without a reason", () => {
    // Somebody will ring up about it, possibly months later.
    expect(action).toContain('if (next === "suspended" && !reason)');
  });

  it("records the reason in the audit row", () => {
    expect(action).toContain("after: { status: next, reason }");
    expect(action).toContain("partner.merchant_suspended");
    expect(action).toContain("partner.merchant_reactivated");
  });

  it("confirms before switching off, and not before switching back on", () => {
    // The cost of a wrongly-suspended shop is measured in lost lunch service.
    expect(ui).toContain("Suspend this account?");
    const reactivate = ui.slice(ui.indexOf("if (suspended)"), ui.indexOf("if (!confirming)"));
    expect(reactivate).not.toContain("setConfirming");
  });

  it("says nothing is deleted, because nothing is", () => {
    // It sets a status. The menu, the orders and the QR codes all wait.
    expect(ui).toContain("Nothing is deleted");
    expect(action).toContain('data: { status: next }');
  });
});

describe("it only claims what it can do", () => {
  it("refuses a product whose suspension it does not understand", () => {
    // It used to refuse everything but Servd. It now handles Resceta as well —
    // `pharmacies.status` is the same column in the same sense and the counter
    // already honours it — and still refuses anything else, because a product
    // this code has never heard of has no table to write to and defaulting to
    // one would switch off the wrong business.
    expect(action).toContain('productId !== "servd" && productId !== "pharmacy"');
    expect(page).toContain('merchant.productId === "servd" || merchant.productId === "pharmacy"');
  });

  it("picks the table from a value it has validated, not from the form", () => {
    // The refusal above runs first, so by the time this branch is reached
    // `productId` is one of exactly two strings.
    const gate = action.indexOf('productId !== "servd" && productId !== "pharmacy"');
    const branch = action.indexOf('productId === "pharmacy"\n          ? await tx.pharmacy');
    expect(gate).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(gate);
  });

  it("still admits what is not built", () => {
    // Plan changes, trial extensions, marking an invoice paid, impersonation.
    expect(page).toContain("Not built yet");
    expect(page).not.toContain("Actions are not built yet");
  });
});
