import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { merchantInvoiceEmail } from "@servd/core";
import { codeAt } from "../support/source";

/**
 * The invoice a PARTNER issues to their own merchant.
 *
 * The restaurant paid their operator, not Servd, and has often never heard of
 * Servd. Every surface here therefore wears the partner's brand and is signed
 * with the partner's name — a receipt from a company somebody did not pay is
 * one they query, or bin as phishing.
 */
const renewals = codeAt("src/server/billing/renewals.ts");
const mail = codeAt("src/server/billing/merchant-invoice.ts");
const page = codeAt("src/app/(platform)/admin/invoices/[id]/page.tsx");

describe("the invoice is written with the money, not after it", () => {
  it("is created inside the confirm transaction", () => {
    const fn = renewals.slice(renewals.indexOf("export async function confirmRenewal"));
    expect(fn).toContain("tx.restaurantInvoice.create");
    // Same transaction as the ledger row and the period extension: an invoice
    // that exists for a payment that rolled back is worse than none.
    expect(fn.indexOf("tx.restaurantInvoice.create")).toBeLessThan(fn.indexOf("recordSettlement"));
  });

  it("cannot print twice for one payment", () => {
    // providerRef is `renewal:{id}` and uniquely indexed.
    expect(renewals).toContain("providerRef: `renewal:${renewalId}`");
    const sql = readFileSync(
      join(process.cwd(), "../../packages/db/prisma/manual/partner-issued-invoices.sql"),
      "utf8",
    );
    expect(sql).toContain("restaurant_invoices_provider_ref");
    expect(sql).toContain("restaurant_invoices_invoice_no");
  });

  it("numbers it from the row id, not a counter", () => {
    // A per-partner sequence needs a lock, and two confirmations racing for the
    // same number would fail one and take a recorded payment down with it.
    expect(renewals).toContain("`INV-${stamp}-${invoice.id.slice(0, 6).toUpperCase()}`");
  });

  it("records who issued it", () => {
    // Null means Servd billed the restaurant itself, which is what every row
    // before this column meant.
    expect(renewals).toContain("issuedByPartnerId: partnerId");
  });
});

describe("it wears the partner's brand, never Servd's", () => {
  it("falls back to the operator's own name, not to Servd", () => {
    expect(page).toContain('partner?.name || "Servd"');
    expect(page).toContain("brand.legalName || brand.displayName");
    expect(page).toContain("brand.primaryColor");
    expect(page).toContain("brand.logoUrl");
  });

  it("prints the partner's legal footer and invents no tax line", () => {
    // Their TIN, their business style, their "not a BIR official receipt".
    // An invented tax line on somebody else's invoice is their problem.
    expect(page).toContain("brand.legalFooter");
    expect(page).not.toContain("TIN:");
    expect(page).not.toMatch(/\bVAT\b/);
  });

  it("signs the email from the partner", () => {
    const copy = merchantInvoiceEmail({
      issuerName: "Tagum City Partner",
      merchantName: "Davao Biryani",
      invoiceNo: "INV-20260917-ABC123",
      amountCentavos: 99_900,
      paidUntil: new Date("2026-10-17T00:00:00Z"),
      invoiceUrl: "https://example.test/admin/invoices/x",
    });
    expect(copy.subject).toContain("Tagum City Partner");
    expect(copy.subject).not.toContain("Servd");
    expect(copy.paragraphs.join(" ")).not.toContain("Servd");
    // The thing the owner actually wanted to know when they paid.
    expect(copy.paragraphs.join(" ")).toContain("paid up to");
  });
});

describe("the email goes somewhere real", () => {
  it("refuses the synthetic login address", () => {
    // A merchant login is `username@staff.<domain>`, which receives no mail.
    expect(mail).toContain("/@staff\\./i.test(address)");
  });

  it("links the PLATFORM host, not the partner portal", () => {
    // /admin is the merchant product. partnerUrl() would send a restaurant
    // owner to their operator's portal, where middleware prefixes /partner and
    // they get a 404 in the wrong brand.
    expect(mail).toContain("platformUrl()");
    expect(mail).not.toContain("partnerUrl()");
  });

  it("never lets a failed email undo a confirmed payment", () => {
    const actions = codeAt("src/server/billing/renewal-actions.ts");
    expect(actions).toContain("queueMerchantInvoice(renewalId, res.invoiceId).catch(() => {})");
  });
});

describe("printing", () => {
  it("uses the browser rather than a PDF dependency", () => {
    // Ctrl-P already makes a clean A4 PDF on every device a shop owner has,
    // and this repo's brief says to ask before adding a dependency.
    expect(codeAt("src/components/billing/PrintButton.tsx")).toContain("window.print()");
    expect(page).toContain("print:");
  });

  it("is reachable from the billing screen, and only where there is one", () => {
    const billing = codeAt("src/app/(platform)/admin/billing/page.tsx");
    expect(billing).toContain("/admin/invoices/${inv.id}");
    // Servd's own gateway rows have nothing to print; linking them all would be
    // a dead link most of the time.
    expect(billing).toContain("inv.issuedByPartnerId &&");
  });

  it("cannot be read by another restaurant", () => {
    // Scoped in the WHERE clause, so a probed id is "not found" rather than
    // "not yours" — which would confirm it exists.
    expect(page).toContain("where: { id, restaurantId }");
  });
});
