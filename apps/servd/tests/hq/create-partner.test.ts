import { describe, it, expect } from "vitest";
import { hqCan, type HqUserRole } from "@servd/core";
import { codeAt } from "../support/source";

/**
 * HQ CAN MAKE A PARTNER, NOT ONLY CONVERT ONE.
 *
 * REPORTED — "in the partners section in HQ, i noticed, i dont have an option
 * to create a partner." There was no such option anywhere. `partner.create`
 * ran in exactly one place, `convertApplication`, which needs a row in
 * `partner_waitlist` — and those only exist when somebody fills in the form on
 * canvexia.com. A partner signed in person, by phone or at a trade show could
 * not be entered into the system at all.
 *
 * Same shape as the nav truncation and the field agent who could not open a
 * merchant account: the rule said yes and the screen offered nothing. Ops and
 * super admin have both held `partners.write` since A1.
 */

const convert = codeAt("src/server/hq/convert.ts");
const actions = codeAt("src/server/hq/applications-actions.ts");
const page = codeAt("src/app/(platform)/hq/partners/page.tsx");

describe("the option exists, on the screen that lists partners", () => {
  it("offers the form from /hq/partners", () => {
    expect(page).toContain("<NewPartner");
  });

  it("gates it on the capability the action checks, not on the role", () => {
    expect(page).toContain('hqCan(user.role, "partners.write")');
    const direct = actions.slice(actions.indexOf("export async function createPartnerAction"));
    expect(direct).toContain('requireHqAction("partners.write")');
  });

  it("is a capability both HQ roles already hold", () => {
    // So this is reachable today rather than shipping behind a role nobody has.
    expect(hqCan("super_admin" as HqUserRole, "partners.write")).toBe(true);
    expect(hqCan("ops" as HqUserRole, "partners.write")).toBe(true);
  });
});

describe("a direct create is the same transaction as a conversion", () => {
  it("goes through convertApplication rather than its own writes", () => {
    // Six writes have to succeed together. A second copy of them is a second
    // way to end up with a territory marked taken and no partner behind it.
    const direct = actions.slice(actions.indexOf("export async function createPartnerAction"));
    expect(direct).toContain("convertApplication({");
    expect(direct).not.toContain("tx.partner.create");
  });

  it("still writes the application row, inside that transaction", () => {
    // It is the only record of where a partner came from. Skipping it would
    // leave a partner with no origin in the one audit trail that answers that.
    expect(convert).toContain("tx.partnerWaitlist.create");
    const at = convert.indexOf("tx.partnerWaitlist.create");
    const open = convert.indexOf("systemDb(async (tx) => {");
    expect(open).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(open);
  });

  it("marks that row as HQ's own, never as a website lead", () => {
    // The Applications screen counts open applications per city to show where
    // demand is. A partner HQ signed is not demand.
    expect(convert).toContain('source: "hq"');
  });

  it("keeps the email-uniqueness refusal", () => {
    // The partner email is the admin seat's login. A duplicate would surface
    // as "something went wrong" on a unique violation.
    expect(convert).toContain("tx.partner.findUnique({");
    expect(convert).toContain("EXISTS:");
  });

  it("audits it under its own action name", () => {
    // "application.converted" on a partner nobody applied for would be false.
    expect(convert).toContain('input.applicant ? "partner.created" : "application.converted"');
  });
});

describe("the form asks for what it needs and nothing it cannot know", () => {
  const form = codeAt("src/components/hq/NewPartner.tsx");

  it("collects the contact and the terms", () => {
    for (const field of [
      "fullName",
      "email",
      "mobile",
      "city",
      "tier",
      "revenueSharePct",
      "collectionMode",
    ]) {
      expect(form, field).toContain(`name="${field}"`);
    }
  });

  it("names each missing field rather than saying 'required fields'", () => {
    const direct = actions.slice(actions.indexOf("export async function createPartnerAction"));
    expect(direct).toContain("Give their full name");
    expect(direct).toContain("Which city do they cover?");
  });

  it("does not print the hours placeholder the schema forced", () => {
    // `hoursPerWeek` is a non-null enum and HQ never asked the question. The
    // value stored is inert; showing it as "20+ h/wk" would be a fact this
    // system invented about a real person.
    const list = codeAt("src/app/(platform)/hq/applications/page.tsx");
    expect(list).toContain('r.source === "hq" ? "—"');
  });

  it("survives the re-render that reveals the invite token", () => {
    // Same rule as PartnerConvertForm: the token exists only in this
    // component's useActionState, so nothing may unmount it on success.
    expect(form).toContain('state.status === "converted"');
    expect(page, "the page must not gate the form on the action's result")
      .not.toContain("converted &&");
  });
});
