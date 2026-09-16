import { describe, it, expect } from "vitest";
import { permissionDefault, can, type PartnerUserRole } from "@servd/core";
import { codeAt } from "../support/source";

/**
 * A PERMISSION A SEAT HOLDS MUST BE REACHABLE FROM A SCREEN THAT SEAT SEES.
 *
 * REPORTED FROM THE FIELD — "as a field agent, i should be able to create a
 * merchant account". They could not. `merchants.create` has been in the sales
 * defaults since A7 and the server action has always accepted it; the FORM
 * lived only on the operator-wide overview, and `/partner` forks before that:
 * a seat without `merchants.view_all` gets "My day" instead. So a salesperson
 * logged the visit, marked it Signed, and had nowhere to open the account they
 * had just sold.
 *
 * `/partner/merchants` was no escape. Its empty state read "Open your first
 * account from the dashboard" and linked to `/partner` — which, for them, is
 * the page without the form.
 *
 * This is the third dead end of the same shape in this area (a disabled button
 * that would not say why; a dropdown with no way to add a business), so the
 * rule is worth a file: a granted permission with no control behind it is a
 * permission the person does not have.
 */

const overview = codeAt("src/app/(platform)/partner/page.tsx");

/** The "My day" branch — everything a seat without merchants.view_all sees. */
const salesBranch = (() => {
  const start = overview.indexOf('!partnerAllows(partner, "merchants.view_all")');
  expect(start, "the sales/support fork has moved").toBeGreaterThan(-1);
  // To the end of that early return. Bounded deliberately: if this marker ever
  // moves, indexOf returns -1, slice(start, -1) runs to the end of the file,
  // and every assertion below would pass against the OPERATOR overview — which
  // has always had the form. That is the shape of a test that cannot fail.
  const end = overview.indexOf("</PortalShell>\n    );\n  }", start);
  expect(end, "the sales branch's closing tag has moved").toBeGreaterThan(start);
  const branch = overview.slice(start, end);
  expect(branch.length, "the slice swallowed the operator overview too").toBeLessThan(
    overview.length / 2,
  );
  return branch;
})();

describe("a field sales seat can open the account it just sold", () => {
  it("holds merchants.create, in both the grid and the legacy matrix", () => {
    // Both, because requireWritablePartner resolves an A7 permission against
    // the seat's grid and a legacy capability against the fixed matrix — and
    // this action names the capability.
    expect(permissionDefault("sales" as PartnerUserRole, "merchants.create")).toBe(true);
    expect(can("sales" as PartnerUserRole, "merchants.create")).toBe(true);
  });

  it("is offered a way to it from the overview it actually lands on", () => {
    // THE BUG: the form lived only after the fork, on the operator-wide
    // overview a sales seat never reaches, and /partner/merchants sent them
    // back to /partner — the page without it. Both halves pointed at each
    // other.
    expect(salesBranch).toContain('href="/partner/merchants"');
    expect(salesBranch).toContain("Open a merchant account");
  });

  it("gates that on the capability, not on the role", () => {
    // So an operator who takes merchants.create off a seat loses the link with
    // it, rather than the two disagreeing.
    expect(salesBranch).toContain('partnerCan(partner, "merchants.create")');
  });

  it("finds the form itself on the merchants page, and only there", () => {
    // One home. Two copies is two things to keep in step, and the copy on the
    // overview is what made this reachable by exactly one kind of seat.
    expect(codeAt("src/app/(platform)/partner/merchants/page.tsx")).toContain("<NewMerchant");
    expect(overview, "the overview should link, not embed").not.toContain("<NewMerchant");
  });

  it("opens that form on arrival only when there is no list to read", () => {
    // A salesperson with no merchants should not hunt for a button; an operator
    // with two hundred should not scroll a six-field form every visit.
    expect(codeAt("src/app/(platform)/partner/merchants/page.tsx")).toContain(
      "defaultOpen={all.length === 0}",
    );
  });

  it("agrees with the server about which capability is needed", () => {
    // A UI gated on one name and a server gated on another is how a button
    // appears and then refuses.
    expect(codeAt("src/server/partners/provision-actions.ts")).toContain(
      'requireWritablePartner("merchants.create")',
    );
  });
});

describe("the merchants list stops sending people to a form they cannot see", () => {
  const page = codeAt("src/app/(platform)/partner/merchants/page.tsx");

  it("only renders the form for a seat that can", () => {
    expect(page).toContain('partnerCan(partner, "merchants.create")');
    const form = page.indexOf("<NewMerchant");
    expect(form).toBeGreaterThan(-1);
    expect(page.lastIndexOf("canCreate &&", form), "the form is not behind the check")
      .toBeGreaterThan(-1);
  });

  it("no longer sends anybody to the dashboard to find it", () => {
    // The old empty state read "Open your first account from the dashboard"
    // and linked to /partner, which for a sales seat is the page without the
    // form. The loop is gone: the form is on this page.
    expect(page).not.toContain("from the dashboard");
    expect(page).not.toContain("Create your first");
  });

  it("says something true to a seat that cannot", () => {
    // Support holds merchants.read and not merchants.create — it answers for
    // accounts rather than opening them.
    expect(can("support" as PartnerUserRole, "merchants.read")).toBe(true);
    expect(can("support" as PartnerUserRole, "merchants.create")).toBe(false);
    expect(page).toContain("answers for merchants");
  });
});

describe("every capability the sales role holds has somewhere to be used", () => {
  /**
   * The screen each of sales' capabilities is exercised from. Listed rather
   * than discovered, so adding a capability to the role without giving it a
   * home fails here instead of in somebody's hands.
   */
  const HOMES: Record<string, string> = {
    "pipeline.read": "src/app/(platform)/partner/pipeline/page.tsx",
    "pipeline.write": "src/app/(platform)/partner/pipeline/page.tsx",
    "merchants.read": "src/app/(platform)/partner/merchants/page.tsx",
    "merchants.create": "src/app/(platform)/partner/page.tsx",
    "merchants.note": "src/app/(platform)/partner/merchants/[key]/page.tsx",
  };

  it("covers the whole sales list, with nothing left over", () => {
    const held = (
      ["pipeline.read", "pipeline.write", "merchants.read", "merchants.create", "merchants.note",
       "merchants.manage", "merchants.impersonate", "revenue.read", "revenue.pricing",
       "brand.write", "domains.write", "team.read", "team.write", "settings.write"] as const
    ).filter((c) => can("sales" as PartnerUserRole, c));
    expect([...held].sort()).toEqual(Object.keys(HOMES).sort());
  });

  it("points each one at a page that exists", () => {
    for (const [cap, path] of Object.entries(HOMES)) {
      expect(() => codeAt(path), `${cap} -> ${path}`).not.toThrow();
    }
  });
});
