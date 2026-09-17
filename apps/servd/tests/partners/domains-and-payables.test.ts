import { describe, it, expect } from "vitest";
import { normaliseHost } from "@/lib/partners/custom-host";
import { codeAt } from "../support/source";

/**
 * Two reported gaps: a Domains page with no instructions, and a Payables page
 * reading ₱0 on the day a merchant paid ₱999.
 */

describe("a payable shows up the moment somebody pays", () => {
  const revenue = codeAt("src/server/partners/revenue.ts");
  const page = codeAt("src/app/(platform)/partner/payables/page.tsx");

  it("reads the CURRENT month live, not only frozen statements", () => {
    // THE BUG: every confirmed renewal writes its ledger row at once, but the
    // page listed only frozen statements — and a month freezes after it ends.
    // A partner who confirmed ₱999 this morning saw ₱0 owed until October, then
    // got one bill and seven days to find the money.
    expect(revenue).toContain("export async function currentMonthAccrual");
    expect(page).toContain("currentMonthAccrual(partner.id)");
  });

  it("computes it with the same function that freezes the month", () => {
    // A second implementation is exactly how a running total and the statement
    // it becomes come to disagree.
    const fn = revenue.slice(revenue.indexOf("export async function currentMonthAccrual"));
    expect(fn).toContain("computeStatement(tx, partnerId, month)");
    expect(fn).toContain("monthKeyOf(new Date())");
  });

  it("says plainly that it is not billed yet", () => {
    // It is accruing, not owed today. Calling it "outstanding" would have a
    // partner paying something nobody has invoiced.
    expect(page).toContain("Building up this month");
    expect(page).toContain("Not billed yet");
    expect(page).toContain("Invoiced and outstanding");
  });

  it("stays quiet at zero", () => {
    expect(page).toContain("accruing && accruing.amountCentavos > 0");
  });
});

describe("a partner can find out how to connect their own domain", () => {
  const ui = codeAt("src/components/partner/CustomDomainForm.tsx");
  const page = codeAt("src/app/(platform)/partner/domains/page.tsx");

  it("no longer tells them to 'tell HQ' with no way to", () => {
    expect(page).not.toContain("Tell HQ which one");
    expect(page).toContain("<CustomDomainForm");
  });

  it("gives the actual records, copyable", () => {
    // A mistyped DNS value is a day lost.
    expect(ui).toContain("cnameTarget");
    expect(ui).toContain("aRecordIp");
    expect(ui).toContain("navigator.clipboard");
  });

  it("distinguishes an apex from a subdomain", () => {
    // They need different records, and picking the wrong one is the single
    // most common way this goes wrong.
    expect(ui).toContain("isApex");
    expect(ui).toContain("An apex domain cannot use a CNAME");
  });

  it("warns them off their MX records", () => {
    // Changing those stops their email, and nothing here needs them touched.
    expect(ui).toContain("MX");
    expect(ui).toContain("stops your");
  });

  it("is honest that the attach is not self-serve", () => {
    // The credential is not on this deployment. A progress bar nothing drives
    // is worse than saying so.
    expect(ui).toContain("Tell us it is done");
    expect(ui).toContain("keeps working on its CANVEXIA address");
  });
});

describe("the hostname a person actually types", () => {
  it("lives outside the server-actions module", () => {
    // A `"use server"` file may only export async functions, so a pure helper
    // in there fails the build — which it did. It is also testable without a
    // request this way.
    const actions = codeAt("src/server/partners/domain-actions.ts");
    expect(actions).toContain('from "@/lib/partners/custom-host"');
    expect(actions).not.toContain("export function normaliseHost");
  });

  it("accepts what somebody pastes", () => {
    for (const raw of [
      "order.mysari.ph",
      "  ORDER.MySari.PH  ",
      "https://order.mysari.ph/",
      "http://order.mysari.ph",
      "order.mysari.ph.",
    ]) {
      expect(normaliseHost(raw), raw).toBe("order.mysari.ph");
    }
  });

  it("keeps an apex as an apex", () => {
    expect(normaliseHost("mysari.ph")).toBe("mysari.ph");
  });

  it("refuses what cannot be a domain", () => {
    for (const raw of ["", "   ", "localhost", "no-dots", "-bad.ph", "bad-.ph", "a.b.", "a..b"]) {
      expect(normaliseHost(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe("a domain request cannot collide or be a CANVEXIA address", () => {
  const action = codeAt("src/server/partners/domain-actions.ts");

  it("refuses one another partner already claimed", () => {
    expect(action).toContain("NOT: { id: who.partnerId }");
  });

  it("refuses the platform's own root", () => {
    // Those are handed out automatically; claiming one here would be a partner
    // asking for an address we already control.
    expect(action).toContain("host.endsWith(`.${reserved}`)");
  });

  it("is gated on domains.write and audited", () => {
    expect(action).toContain('requireWritablePartner("domains.write")');
    expect(action).toContain("partner.custom_domain_requested");
  });
});
