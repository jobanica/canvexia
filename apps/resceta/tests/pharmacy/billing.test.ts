import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { can, type PharmacyRole } from "@/lib/pharmacy/roles";

/**
 * RESCETA HAS BILLING.
 *
 * It had none: no plan, no expiry, no renewal, no invoice, and — the quieter
 * half — no ledger entry, so a partner selling Resceta earned nothing this
 * platform recorded and CANVEXIA's 30% never accrued.
 *
 * The renewal is the SAME flow Servd uses rather than a second one beside it.
 * Nothing about it is automatic and nothing should be: the payment happens in
 * cash or on an e-wallet, off this system, and there is no webhook to believe.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const server = src("server/pharmacy/billing.ts");
const page = src("app/billing/page.tsx");

describe("every query names the product", () => {
  it("scopes the subscription, the invoices and the renewal by it", () => {
    // `restaurantId` on these tables means "the merchant id within productId",
    // and the two id spaces are separate. Matching on the id alone would be
    // correct only by the accident of uuids not colliding.
    expect(server).toContain("where: { restaurantId: pharmacyId, productId: PRODUCT }");
    expect(server).toContain("productId: PRODUCT");
    expect(server).not.toMatch(/where: \{ restaurantId: pharmacyId \}/);
  });

  it("takes the pharmacy from the session, never from a form", () => {
    expect(src("app/billing/actions.ts")).toContain("staff.pharmacyId");
    expect(src("app/billing/actions.ts")).not.toContain('formData.get("pharmacyId")');
  });
});

describe("who may see and do it", () => {
  it("is the owner's, not a manager's or a cashier's", () => {
    expect(can("owner" as PharmacyRole, "manageSettings")).toBe(true);
    expect(can("manager" as PharmacyRole, "manageSettings")).toBe(false);
    expect(can("cashier" as PharmacyRole, "manageSettings")).toBe(false);
  });

  it("checks that on the page and again in both actions", () => {
    expect(page).toContain('can(staff.role, "manageSettings")');
    expect(src("app/billing/actions.ts").match(/requireStaff\("manageSettings"\)/g)?.length).toBe(2);
  });

  it("is reachable from the nav", () => {
    expect(src("components/AppShell.tsx")).toContain('href: "/billing"');
  });
});

describe("what the page says", () => {
  it("shows the plan and the price", () => {
    expect(page).toContain("peso(billing.priceMonthly)");
  });

  it("shows when it runs out, and warns inside a fortnight", () => {
    // It was never shown anywhere, so the first an owner knew of a lapse was
    // the day something stopped.
    expect(page).toContain("Paid until");
    expect(page).toContain("<= 14");
  });

  it("does not threaten something this software does not do", () => {
    // billedExternally means the cron never duns or suspends this account. The
    // partner decides, and saying "the counter will stop" would be a threat
    // nothing carries out.
    expect(page).toContain("they decide whether to switch the counter off");
  });

  it("has no feature list", () => {
    // Everything is included in the one plan, so a grid of rows all reading
    // "Included" is a shelf with nothing on it.
    expect(page).not.toContain("Features");
    expect(page).toContain("Everything in Resceta is included");
  });

  it("says so plainly when there is no subscription row", () => {
    // A pharmacy without one is a provisioning gap, not a free account.
    expect(page).toContain("No subscription is recorded");
  });

  it("says so plainly when the partner has uploaded no payment code", () => {
    // Telling somebody to scan nothing is worse than telling them to ring.
    expect(src("app/billing/RenewPanel.tsx")).toContain("has not uploaded a payment code yet");
  });
});

describe("the receipt goes where the partner will look for it", () => {
  it("uses the portal's own bucket and path shape", () => {
    // The reviewer is in the other app. A new path would upload successfully
    // and be invisible to the person who has to approve it.
    expect(server).toContain('const BUCKET = "partner-billing"');
    expect(server).toContain("`receipts/${partnerId}/${merchantId}/");
  });

  it("keeps both pictures private, behind a short signed URL", () => {
    // A receipt is a screenshot of somebody's e-wallet, with their name and
    // often their balance on it.
    expect(server).toContain("createSignedUrl(path, 600)");
  });

  it("refuses anything that is not a reasonable image", () => {
    expect(server).toContain("Use a JPEG, PNG or WebP image.");
    expect(server).toContain("MAX_BYTES");
  });

  it("will not attach a receipt to a renewal already decided", () => {
    // It must not look like it is waiting again.
    expect(server).toContain('where: { id: renewal.id, status: { in: ["requested", "receipt_uploaded"] } }');
  });
});
