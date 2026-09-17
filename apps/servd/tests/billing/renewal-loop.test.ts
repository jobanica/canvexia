import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitRevenue } from "@/lib/partners/revenue-share";
import { codeAt } from "../support/source";

/**
 * The renewal loop, and the money it moves.
 *
 * A merchant taps Renew, pays the partner off-system, uploads a receipt; the
 * partner recognises the payment and confirms. THAT confirmation is what
 * extends the subscription and writes CANVEXIA's share to the ledger — the
 * split existed and nothing had ever produced a row for a partner-sold
 * renewal, so 30% of every resold subscription went unrecorded.
 */
const renewals = codeAt("src/server/billing/renewals.ts");
const actions = codeAt("src/server/billing/renewal-actions.ts");

describe("the split is CANVEXIA's 30%", () => {
  it("leaves the partner 70 and HQ 30", () => {
    // revenueSharePct is the PARTNER's share, and both live partners are on 70.
    const { partner, hq } = splitRevenue(99_900, 70);
    expect(partner).toBe(69_930);
    expect(hq).toBe(29_970);
    expect(partner + hq).toBe(99_900);
  });

  it("never loses a centavo to rounding", () => {
    for (const amount of [1, 7, 99, 33_333, 99_901]) {
      const { partner, hq } = splitRevenue(amount, 70);
      expect(partner + hq, String(amount)).toBe(amount);
    }
  });
});

describe("confirming is the only thing that moves money", () => {
  it("writes through the ledger writer that already exists", () => {
    // recordSettlement is idempotent on providerRef, snapshots the split in
    // force today, and refuses a merchant with no owner. A second writer here
    // would be three things to get right again.
    expect(renewals).toContain("recordSettlement(tx,");
    expect(renewals).toContain("providerRef: `renewal:${renewalId}`");
  });

  it("claims the renewal before doing anything else", () => {
    // Two taps on Confirm, or two seats at once, must produce one extension and
    // one ledger row — not two of each.
    const fn = renewals.slice(renewals.indexOf("export async function confirmRenewal"));
    const claim = fn.indexOf("updateMany");
    expect(claim).toBeGreaterThan(-1);
    expect(fn.indexOf("recordSettlement")).toBeGreaterThan(claim);
    expect(fn.indexOf("subscription.update")).toBeGreaterThan(claim);
    expect(fn).toContain("if (claimed.count === 0) return null;");
  });

  it("only claims a renewal still awaiting a decision, owned by this partner", () => {
    const fn = renewals.slice(renewals.indexOf("export async function confirmRenewal"));
    expect(fn).toContain("partnerId,");
    expect(fn).toContain('status: { in: ["requested", "receipt_uploaded"] }');
  });

  it("records what was COLLECTED, not the list price", () => {
    // A partner may charge above the ₱999 floor, and the 30% is a share of what
    // was really charged. Recording the floor would understate what they owe.
    expect(renewals).toContain("grossAmount: amountCentavos");
    expect(actions).toContain('formData.get("amountPesos")');
  });
});

describe("extending the period cannot lose or invent time", () => {
  it("extends from the later of now and the current period end", () => {
    // Renewing early must ADD a month to what is left, not throw the remainder
    // away. Renewing after a lapse must start today, not backdate into a gap
    // nobody paid for.
    expect(renewals).toContain(
      "sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now",
    );
  });

  it("switches a suspended shop back on", () => {
    // Somebody who has just paid should not have to ask twice.
    const fn = renewals.slice(renewals.indexOf("export async function confirmRenewal"));
    expect(fn).toContain('data: { status: "active" }');
  });
});

describe("one renewal at a time", () => {
  it("is enforced by a partial unique index, not by checking first", () => {
    // Two requests confirmed separately would extend the shop two months for
    // one payment. A check-then-insert has a gap between the two.
    const sql = readFileSync(
      join(process.cwd(), "../../packages/db/prisma/manual/merchant-renewals.sql"),
      "utf8",
    );
    expect(sql).toContain("merchant_renewals_one_open");
    expect(sql).toContain("where status in ('requested', 'receipt_uploaded')");
  });

  it("treats losing that race as success, because it is", () => {
    // From the owner's side a renewal is now in progress, which is true.
    expect(actions).toContain("You already have a renewal in progress.");
  });
});

describe("the evidence is private", () => {
  it("keeps receipts and payment codes out of a public bucket", () => {
    // A receipt is a screenshot of somebody's e-wallet, with their name and
    // often their balance on it.
    const storage = codeAt("src/server/storage/partner-billing.ts");
    expect(storage).toContain("ensureBucket(supabase, BILLING_BUCKET, false)");
    expect(storage).toContain("createSignedUrl(path, 600)");
  });

  it("puts the logo in a public one, because it is meant to be seen", () => {
    const brand = codeAt("src/server/storage/partner-brand.ts");
    expect(brand).toContain("ensureBucket(supabase, BRAND_BUCKET, true)");
  });
});

describe("HQ's monthly invoice matches the partner's payable", () => {
  const invoice = codeAt("src/server/hq/statement-invoice.ts");
  const payables = codeAt("src/server/partners/revenue.ts");

  it("both read hqCentavos off the same frozen statement", () => {
    // The bill in their inbox and the total in their portal cannot disagree.
    expect(invoice).toContain("hqCentavos");
    expect(payables).toContain("amountCentavos: r.hqCentavos");
  });

  it("is queued once, on the first freeze only", () => {
    // freezeStatement is idempotent; re-running the month must not re-invoice.
    const hq = codeAt("src/server/hq/billing-actions.ts");
    expect(hq).toContain("if (r.created) {");
    expect(hq).toContain("queueStatementInvoice(p.id, month)");
  });

  it("does not bill somebody for nothing", () => {
    expect(invoice).toContain("if (statement.hqCentavos <= 0) return false;");
  });

  it("gives seven days, from a date rather than a phrase", () => {
    const stmts = readFileSync(
      join(process.cwd(), "../../packages/db/src/statements.ts"),
      "utf8",
    );
    expect(stmts).toContain("SETTLEMENT_DAYS = 7");
    expect(stmts).toContain("dueAt:");
    // An email can sit in a spam folder for three days, which makes "within 7
    // days" a lie. The template prints the date.
    const tpl = readFileSync(
      join(process.cwd(), "../../packages/core/src/email/templates.ts"),
      "utf8",
    );
    expect(tpl).toContain("Please settle by ${due}");
  });

  it("marks overdue from the date, not from a column a human moves", () => {
    expect(payables).toContain("r.dueAt.getTime() < now");
  });
});
