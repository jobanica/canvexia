import { describe, it, expect } from "vitest";
import { codeAt } from "../support/source";

/**
 * A PARTNER SELLING RESCETA NOW EARNS SOMETHING THIS PLATFORM RECORDS.
 *
 * `subscriptions` and `restaurant_invoices` were written when a merchant was a
 * restaurant and nothing else, so a pharmacy had no plan, no expiry, no renewal
 * and no invoice. The worse half was quieter: `recordSettlement` read
 * `tx.restaurant` and nothing else, so a pharmacy could never produce a ledger
 * entry — and CANVEXIA's 30% never accrued on a peso of Resceta revenue.
 *
 * The fix follows a pattern this database already had. `partner_ledger_entries`
 * and `merchant_renewals` both carry (productId, merchantId) with the note "the
 * table it points at depends on productId"; the last two billing tables now
 * agree with them, rather than a parallel set of pharmacy_* tables that would
 * be a second billing engine to keep correct.
 */

const ledger = codeAt("src/server/billing/ledger.ts");
const renewals = codeAt("src/server/billing/renewals.ts");

describe("the ledger can be written for either product", () => {
  it("asks the right table who owns the merchant", () => {
    expect(ledger).toContain("tx.pharmacy.findUnique");
    expect(ledger).toContain("tx.restaurant.findUnique");
  });

  it("takes the product as a union, not a free string", () => {
    // A product this function has never heard of has no table to ask.
    expect(ledger).toContain('productId?: "servd" | "pharmacy"');
  });

  it("defaults to servd so no existing caller had to change", () => {
    expect(ledger).toContain('const productId = input.productId ?? "servd"');
  });

  it("stamps the product it was told rather than assuming one", () => {
    // It used to hard-code productId: "servd" on every row it wrote.
    expect(ledger).not.toContain('productId: "servd",');
    expect(ledger).toContain("      productId,\n      merchantId: restaurantId,");
  });

  it("still refuses a merchant with no partner, on either axis", () => {
    // Inventing an owner would put somebody else's revenue on a statement.
    expect(ledger).toContain("if (!owner?.partnerId)");
    expect(ledger).toContain("has no partner.");
  });

  it("is still idempotent on the gateway reference", () => {
    // A replayed confirmation must not pay a partner twice.
    expect(ledger).toContain("tx.partnerLedgerEntry.findUnique");
    expect(ledger).toContain("if (already) return;");
  });
});

describe("confirming a renewal works for a pharmacy", () => {
  it("reads the product off the renewal row rather than assuming", () => {
    // merchant_renewals has carried productId since it was written. This
    // function simply never read it, so a pharmacy renewal could be requested,
    // receipted and confirmed and extend nothing.
    expect(renewals).toContain('const productId = row.productId === "pharmacy" ? "pharmacy" : "servd"');
  });

  it("finds the subscription by product AND id", () => {
    // The two id spaces are separate; matching on the id alone is correct only
    // by the accident of uuids not colliding.
    expect(renewals).toContain("where: { restaurantId: row.merchantId, productId }");
  });

  it("un-suspends the right table", () => {
    expect(renewals).toContain("tx.pharmacy.updateMany");
    expect(renewals).toContain("tx.restaurant.updateMany");
  });

  it("stamps the product on the invoice it writes", () => {
    expect(renewals).toContain("restaurantId: row.merchantId,\n          productId,");
  });

  it("passes the product through to the settlement", () => {
    // This is the line that makes the 30% accrue.
    expect(renewals).toContain("restaurantId: row.merchantId,\n        productId,");
  });

  it("still claims the row before it moves any money", () => {
    // Two taps on Confirm must produce one extension and one ledger row.
    const claim = renewals.indexOf("tx.merchantRenewal.updateMany");
    const settle = renewals.indexOf("recordSettlement(tx");
    expect(claim).toBeGreaterThan(-1);
    expect(settle).toBeGreaterThan(claim);
  });
});

describe("the partner's queue names pharmacies correctly", () => {
  it("looks up each product's ids in its own table", () => {
    // Asking one table for all of them labels the rest "Unknown".
    expect(renewals).toContain('idsFor("pharmacy")');
    expect(renewals).toContain("tx.pharmacy.findMany");
  });

  it("keys the name map by product and id", () => {
    // Ids are unique within a product, not across them.
    expect(renewals).toContain("byId.get(`${r.productId}:${r.merchantId}`)");
  });
});

describe("a new pharmacy is born with a plan", () => {
  const provision = codeAt("../../packages/db/src/provisioning/pharmacy.ts");

  it("creates the subscription in the same transaction as the pharmacy", () => {
    expect(provision).toContain("tx.subscription");
    expect(provision).toContain('productId: "pharmacy"');
  });

  it("marks it billed externally", () => {
    // The daily cron must never invoice, dun or suspend one of these: the money
    // is collected by the partner, off this system.
    expect(provision).toContain("billedExternally: true");
    expect(codeAt("src/server/billing/run-cron.ts")).toContain("if (sub.billedExternally) continue;");
  });

  it("sets a period end rather than leaving it null", () => {
    // Null reads as "no boundary", which is how a shop once sat on a paid plan
    // that never expired with a Renew button that had nothing to renew.
    expect(provision).toContain("currentPeriodEnd: periodEnd");
  });

  it("does not fail provisioning when the plan seed is missing", () => {
    // A merchant with no subscription is recoverable; a provisioning call that
    // throws is not.
    expect(provision).toContain(".catch(() => null)");
    expect(provision).toContain("subscribed: !!plan");
  });
});
