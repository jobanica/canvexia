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


/**
 * Finishing the sale: handing the owner a login.
 *
 * A partner-opened account has NO login — provisioning makes the tenant, the
 * storefront and the complimentary trial and stops, because at that point
 * nobody has agreed to anything. `convertPartnerDemo` is what mints the
 * credential, and it checks `merchants.create`, which sales holds.
 *
 * It lived only in the storefronts list on the OPERATOR overview. Same fork,
 * fourth time: a field agent could open the account and then had nowhere to get
 * the owner a username and password.
 */
describe("a sales seat can hand over the login", () => {
  const detail = codeAt("src/app/(platform)/partner/merchants/[key]/page.tsx");

  it("puts the convert form on the merchant itself", () => {
    expect(detail).toContain("<PartnerConvertForm restaurantId={merchant.id}");
  });

  it("gates it on the capability the server actually checks", () => {
    // convertPartnerDemo -> requireDemoWriter -> requireWritablePartner(
    //   DEMO_CAPABILITY ), and DEMO_CAPABILITY is merchants.create.
    expect(detail).toContain('partnerCan(partner, "merchants.create")');
    expect(codeAt("src/server/partners/demo.ts")).toContain(
      'const DEMO_CAPABILITY = "merchants.create"',
    );
    expect(can("sales" as PartnerUserRole, "merchants.create")).toBe(true);
  });

  it("asks the question only for Servd", () => {
    // The pharmacy vertical has no convert flow at all.
    expect(detail).toContain('merchant.productId === "servd" ? await demoLogin(merchant.id)');
  });

  it("shows the username once there is one, rather than a dash", () => {
    expect(detail).toContain("No login yet");
    expect(detail).toContain("The owner signs in as");
  });
});

describe("the merchant list says which accounts nobody can sign into", () => {
  const table = codeAt("src/components/partner/MerchantTable.tsx");
  const query = codeAt("src/server/partners/merchants.ts");

  it("marks them, next to the billing status rather than instead of it", () => {
    // TRIAL was answering a different question, and answering it confidently
    // enough that the account looked finished.
    expect(table).toContain("No login");
    expect(table).toContain("<NoLogin has={m.hasLogin} />");
  });

  it("says nothing when it could not tell", () => {
    // A wrong "no login" chip sends somebody to a form that then refuses.
    expect(table).toContain("if (has !== false) return null");
  });

  it("does not count the temporary preview login as a real one", () => {
    // That login exists to demo the storefront to the very prospect being
    // pitched. Counting it would hide the convert form on the account it was
    // issued to help sell.
    expect(query).toContain("previewExpiresAt: null");
  });

  it("falls back when that column is not migrated yet", () => {
    // Same rule as countRealLogins: where previewExpiresAt does not exist, no
    // preview login can either, so every staff row is real.
    const fn = query.slice(query.indexOf("async function withLoginState"));
    expect(fn).toContain(".catch(() =>");
    // And a failed read leaves the rows alone rather than claiming "no login".
    expect(fn).toContain("return rows;");
  });
});


/**
 * THE PASSWORD THAT WAS SHOWN FOR NO FRAMES.
 *
 * REPORTED — "it auto converted, and there is no password shown", on a real
 * merchant, which was left with a credential nobody had.
 *
 * A server action re-renders the page's server tree when it finishes. The
 * merchant page rendered the convert form as `{!login.converted &&
 * <PartnerConvertForm/>}`, so the successful conversion set `converted` true,
 * the server tree came back without the component, React unmounted it, and its
 * `useActionState` — the only place the password ever existed — went with it.
 *
 * The rule: NEVER decide whether to mount a component on the state its own
 * action changes. Pass the state in and let the component decide.
 */
describe("a one-shot credential survives the re-render that reveals it", () => {
  const form = codeAt("src/components/partner/PartnerConvertForm.tsx");

  it("takes `alreadyConverted` as a prop", () => {
    expect(form).toContain("alreadyConverted");
  });

  it("shows credentials it holds BEFORE it considers that prop", () => {
    // Order matters and is the whole fix: state in hand beats the page's
    // opinion that the conversion is already done.
    const shows = form.indexOf("state?.ok && state.credentials");
    const bails = form.indexOf("if (alreadyConverted) return null");
    expect(shows).toBeGreaterThan(-1);
    expect(bails).toBeGreaterThan(shows);
  });

  it("is never gated on `converted` by any caller", () => {
    // Both callers had the same shape. Either one reintroduces the bug.
    for (const p of [
      "src/app/(platform)/partner/merchants/[key]/page.tsx",
      "src/components/partner/PartnerDemos.tsx",
    ]) {
      const caller = codeAt(p);
      const at = caller.indexOf("<PartnerConvertForm");
      expect(at, p).toBeGreaterThan(-1);
      // The JSX conditional immediately before the element must not test a
      // converted flag.
      const preceding = caller.slice(Math.max(0, at - 260), at);
      expect(preceding, `${p} gates the form on converted`).not.toMatch(
        /!\s*(login\.converted|demo\.converted)/,
      );
    }
  });
});

describe("a lost password can be re-issued", () => {
  const action = codeAt("src/server/partners/demo.ts");
  const reset = action.slice(action.indexOf("export async function resetMerchantPassword"));
  const detail = codeAt("src/app/(platform)/partner/merchants/[key]/page.tsx");

  it("exists at all, which is what makes 'shown once' safe", () => {
    // Without it, the bug above was unrecoverable: the owner's login is a
    // synthetic address at a domain that receives no mail, so "reset it from
    // the sign-in page" reached nobody.
    expect(reset.length).toBeGreaterThan(0);
    expect(detail).toContain("<MerchantPasswordReset restaurantId={merchant.id} />");
  });

  it("checks ownership and the same capability as converting", () => {
    expect(reset).toContain("requireWritablePartner(DEMO_CAPABILITY)");
    expect(reset).toContain("ownDemo(restaurantId, who.partnerId)");
  });

  it("refuses an account that has no login to reset", () => {
    expect(reset).toContain("convert it first");
  });

  it("audits the login and never the password", () => {
    expect(reset).toContain("partner.merchant_password_reset");
    expect(reset).toContain("after: { login:");
    const after = reset.slice(reset.indexOf("after: { login:"));
    expect(after.slice(0, 80)).not.toContain("password");
  });

  it("does not let a failed audit report the password as unchanged", () => {
    // It is already changed by then. Saying otherwise sends somebody to read
    // out a password that no longer works.
    expect(reset.indexOf("writeSeatAudit")).toBeGreaterThan(reset.indexOf("updateUserById"));
  });

  it("hands back a password and never a session", () => {
    // Re-issuing a credential is not impersonation, which is still not built.
    expect(reset).toContain("return { ok: true, login:");
    expect(reset).not.toContain("signIn");
    expect(reset).not.toContain("setSession");
  });
});
