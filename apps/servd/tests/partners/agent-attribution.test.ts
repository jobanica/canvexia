import { describe, it, expect } from "vitest";
import { permissionDefault, type PartnerUserRole } from "@servd/core";
import { codeAt } from "../support/source";

/**
 * THE AGENT WHO SIGNED A SHOP IS WHO THAT SHOP RINGS.
 *
 * REPORTED — "all the merchants that I activated will be supported by the agent
 * who created it, so partner can see who activated it and if have problem,
 * knows who to call."
 *
 * `assignedSalesUserId` was READ in five places — the commission run, the staff
 * scorecard, the staff detail screen and both reassignment paths — and written
 * by NONE of them at the moment a merchant was opened. A field agent signed a
 * shop and their commission was zero, their scorecard was empty, and the
 * merchant's own page said "Signed by: Nobody yet". The column existed, every
 * reader existed, nothing ever filled it in.
 */

const provision = codeAt("src/server/partners/provision-actions.ts");
const detail = codeAt("src/app/(platform)/partner/merchants/[key]/page.tsx");
const merchants = codeAt("src/server/partners/merchants.ts");

describe("opening a merchant assigns it to the seat that opened it", () => {
  it("stamps both columns", () => {
    // At this size they are the same person: whoever signed the shop is who it
    // rings when the printer dies. An operator can move support later.
    expect(provision).toContain("assignedSalesUserId: seatId, assignedSupportUserId: seatId");
  });

  it("writes to the right table for the product", () => {
    expect(provision).toContain("tx.pharmacy.updateMany");
    expect(provision).toContain("tx.restaurant.updateMany");
  });

  it("keeps ownership in the WHERE clause", () => {
    // A merchant belonging to another partner matches zero rows rather than
    // being stamped.
    expect(provision).toContain("{ id: outcome.result.merchantId, partnerId: partner.id }");
  });

  it("credits a seat, and skips a legacy login that has none", () => {
    expect(provision).toContain("const seatId = who.userId;");
    expect(provision).toContain("if (seatId) {");
  });

  it("never costs somebody the account they just sold", () => {
    // The merchant is created and belongs to the partner either way. A failed
    // attribution is logged and leaves a visible, fixable "Nobody yet".
    const after = provision.slice(provision.indexOf("const seatId"));
    expect(after).toContain("catch (e)");
    expect(after).toContain("console.error(");
  });

  it("runs after provisioning, not inside it", () => {
    const created = provision.indexOf("provisionMerchantForPartner(");
    const stamped = provision.indexOf("assignedSalesUserId: seatId");
    expect(created).toBeGreaterThan(-1);
    expect(stamped).toBeGreaterThan(created);
  });
});

describe("the merchant page says who to call", () => {
  it("gives a number, not just a name", () => {
    // "Signed by Juan" at 8pm with a broken till still means looking Juan up.
    expect(merchants).toContain("mobile: u.mobile?.trim() || null");
    expect(detail).toContain("href={`tel:");
  });

  it("still names somebody who has left, and marks them", () => {
    // The person who signed it is a historical fact; ringing a number that has
    // left the company is not.
    expect(merchants).toContain('active: u.status === "active"');
    expect(detail).toContain("Left");
  });

  it("says a missing number is missing", () => {
    expect(detail).toContain("No mobile on their profile yet");
  });

  it("calls an unassigned merchant a thing to fix, not 'not applicable'", () => {
    expect(detail).toContain("Nobody yet");
  });
});

describe("a seat can read and fix its own record", () => {
  const page = codeAt("src/app/(platform)/partner/me/page.tsx");
  const action = codeAt("src/server/partners/profile-actions.ts");

  it("exists at all, and is in the nav for every seat", () => {
    // /partner/team/staff/[id] is behind `team.manage`, so a field agent could
    // be looked AT and could not look at themselves — including at the mobile
    // their own merchants are told to ring.
    expect(codeAt("src/components/partner/portal-nav.tsx")).toContain('href: "/partner/me"');
    expect(page).toContain("getStaffBook(partner.id, seatId)");
  });

  it("gates on the key every working seat holds", () => {
    expect(page).toContain('requirePartnerPageWith("overview.view")');
    for (const role of ["admin", "ops_manager", "sales", "support"] as PartnerUserRole[]) {
      expect(permissionDefault(role, "overview.view"), role).toBe(true);
    }
  });

  it("goes through the one write gate, rather than checking impersonation by hand", () => {
    // A hand-rolled check is the one somebody forgets, which is why refusing an
    // HQ view-as session is not a thing each action decides for itself.
    expect(action).toContain('requireWritablePartner("overview.view")');
    expect(action).not.toContain("impersonatedBy");
  });

  it("cannot change the things that are the access control", () => {
    // Role, status, email and partner. A self-service form that could touch any
    // of them would be a privilege escalation with a friendly label.
    const data = action.slice(action.indexOf("const data = {"), action.indexOf("try {"));
    for (const forbidden of ["role", "status", "email", "partnerId"]) {
      expect(data, forbidden).not.toContain(`${forbidden}:`);
    }
  });

  it("puts the seat id in the WHERE clause with the partner", () => {
    expect(action).toContain("where: { id: seatId, partnerId: partner.id }");
  });

  it("keeps the emergency contact out of the audit log", () => {
    // The log is read by more people than the record is.
    const after = action.slice(action.indexOf("after: {"));
    expect(after.slice(0, 80)).not.toContain("emergency");
  });

  it("explains why the mobile matters, where it is typed", () => {
    expect(codeAt("src/components/partner/MyProfileForm.tsx")).toContain(
      "so whoever has a problem can ring you",
    );
  });
});

describe("a pharmacy can be switched on from the pharmacy's own page", () => {
  const activate = codeAt("src/components/partner/PharmacyActivate.tsx");

  it("is on the merchant page, not only the partner-wide overview", () => {
    // REPORTED — "I tried to create a merchant for Resceta, but I don't know
    // where to activate it." /partner forks before that card: a seat without
    // `merchants.view_all` gets "My day" instead, so the agent who opened the
    // pharmacy could not reach the one button that makes it usable.
    expect(detail).toContain("<PharmacyActivate");
    expect(detail).toContain('merchant.productId === "pharmacy"');
  });

  it("shows the state to anybody who can see the merchant", () => {
    // "This cannot dispense yet" is a fact about the account, not a capability
    // to hide — and hiding the whole thing is what produced the bug report.
    expect(activate).toContain("Not live yet");
    expect(detail).toContain('canActivate={partnerCan(partner, "merchants.manage")}');
  });

  it("names who can do it rather than leaving a blank", () => {
    expect(activate).toContain("An admin or ops manager at your partner switches it on");
  });

  it("puts the reason where the button would be, instead of disabling it", () => {
    expect(activate).toContain("{activation.message}");
  });

  it("resolves the state scoped to the partner", () => {
    const q = codeAt("src/server/partners/pharmacies.ts");
    expect(q).toContain("export async function pharmacyActivation");
    expect(q).toContain("where: { id: pharmacyId, partnerId }");
  });
});
