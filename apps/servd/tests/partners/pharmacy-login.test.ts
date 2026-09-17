import { describe, it, expect } from "vitest";
import { codeAt } from "../support/source";

/**
 * A PHARMACY NOBODY COULD SIGN IN TO.
 *
 * REPORTED — "I activated it, but I cannot see the login details of the
 * account."
 *
 * There were none. The portal could sign a pharmacy, provision it, bill it and
 * switch it live, and the FIRST account at it came from
 * `pnpm --filter resceta staff:create` — a CLI run by whoever holds the
 * service-role key. Every step of the sale worked and the product was
 * unusable at the end of it.
 *
 * The same defect class as the rest of this session: the rules say yes and the
 * screen offers nothing.
 */

const owner = codeAt("src/server/partners/pharmacy-owner.ts");
const actions = codeAt("src/server/partners/pharmacy-actions.ts");
const form = codeAt("src/components/partner/PharmacyOwnerForm.tsx");
const page = codeAt("src/app/(platform)/partner/merchants/[key]/page.tsx");

describe("the screen exists at all", () => {
  it("mounts the handover on the merchant page", () => {
    expect(page).toContain("<PharmacyOwnerForm");
    expect(page).toContain("pharmacyOwnerState(partner.id, merchant.id)");
  });

  it("only for a pharmacy", () => {
    // Servd merchants have their own handover — `convertPartnerDemo` — and
    // rendering both would offer two different logins for one shop.
    expect(page).toMatch(/merchant\.productId === "pharmacy"\s*\n?\s*\?\s*await pharmacyOwnerState/);
  });

  it("only for a seat that may open an account", () => {
    expect(page).toContain("{pharmacyOwner && canConvert && (");
    expect(page).toContain('const canConvert = partnerCan(partner, "merchants.create");');
  });
});

describe("credentials survive the server action that produced them", () => {
  /**
   * THE RULE THIS FILE EXISTS TO PIN.
   *
   * A finished server action re-renders the page's server tree. Servd's convert
   * form was once mounted as `{!login.converted && <Form/>}`; the successful
   * conversion flipped `converted`, React unmounted the component, and the
   * `useActionState` holding the one-shot password went with it. A real
   * merchant ended up with a credential nobody had.
   *
   * So `hasStaff` — which the create action flips from false to true — is a
   * PROP, and it is read only after any credentials in hand have been rendered.
   */
  it("takes hasStaff as a prop rather than gating the mount on it", () => {
    expect(form).toContain("hasStaff: boolean;");
    expect(page).not.toMatch(/!pharmacyOwner\.hasStaff\s*&&\s*<PharmacyOwnerForm/);
  });

  it("renders the credentials BEFORE consulting hasStaff", () => {
    const shown = form.indexOf("if (shown) return <Credentials");
    const consulted = form.indexOf("if (hasStaff) {");
    expect(shown).toBeGreaterThan(-1);
    expect(consulted).toBeGreaterThan(-1);
    expect(shown).toBeLessThan(consulted);
  });

  it("shows whichever of the two actions produced them", () => {
    // A reset issued from the "already has a login" branch has to reach the
    // same panel, or the new password is generated and never displayed.
    expect(form).toContain(
      'const shown = state.status === "done" ? state : reset.status === "done" ? reset : null;',
    );
  });

  it("gives the partner all three things, not just a password", () => {
    // Read out standing in the shop: where to sign in, as whom, with what.
    expect(form).toContain("shown.signInUrl");
    expect(form).toContain("{email}");
    expect(form).toContain("{password}");
  });
});

describe("the write order that cannot strand a login", () => {
  it("creates the auth user before the membership row", () => {
    const authUser = owner.indexOf("admin.auth.admin.createUser");
    const membership = owner.indexOf("tx.pharmacyStaff.create");
    expect(authUser).toBeGreaterThan(-1);
    expect(membership).toBeGreaterThan(authUser);
  });

  it("rolls the auth user back only when it made it", () => {
    // One person can be staff at two pharmacies: that is one Supabase login
    // with two memberships. Deleting a reused user because OUR membership write
    // failed would take away their login at the other shop.
    expect(owner).toContain("let createdHere = true;");
    expect(owner).toContain("createdHere = false;");
    expect(owner).toContain("if (createdHere) {");
    expect(owner).toMatch(/if \(createdHere\) \{\s*await admin\.auth\.admin\.deleteUser/);
  });

  it("sets the password on a reused user, so the shown one is the real one", () => {
    expect(owner).toContain("admin.auth.admin.updateUserById(authUserId, { password })");
  });
});

describe("what is recorded and what is not", () => {
  it("audits the handover", () => {
    expect(owner).toContain('action: "pharmacy.owner_created"');
    expect(owner).toContain('action: "pharmacy.owner_password_reset"');
  });

  it("never writes the password into the audit row", () => {
    // The audit payloads carry the address and the role. Anything reaching for
    // `password` inside an `after:` would put a live credential in a table
    // every partner admin can read.
    const payloads = [...owner.matchAll(/after: \{[^}]*\}/g)].map((m) => m[0]);
    // Both audits, or this loop is asserting over nothing.
    expect(payloads.length).toBe(2);
    for (const p of payloads) expect(p).not.toContain("password");
  });

  it("stores the password nowhere else either", () => {
    expect(owner).not.toContain("passwordHash");
    expect(owner).not.toContain("console.log");
  });
});

describe("scoping", () => {
  it("reads staff through the pharmacy's partner, in the WHERE clause", () => {
    // A pharmacy belonging to another partner matches nothing, rather than
    // leaking who works there.
    expect(owner).toContain("where: { pharmacy: { id: pharmacyId, partnerId } }");
  });

  it("scopes the create and the reset the same way", () => {
    expect(owner).toContain("where: { id: input.pharmacyId, partnerId: input.partnerId }");
    expect(owner).toContain(
      'where: { pharmacy: { id: input.pharmacyId, partnerId: input.partnerId }, role: "owner" }',
    );
  });

  it("gates both actions on the key that opens an account", () => {
    const gates = actions.match(/requireWritablePartner\("merchants\.create"\)/g) ?? [];
    // Activate, create-owner, reset-password: the seat standing in the shop.
    expect(gates.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses to create a second first-login", () => {
    // Two owners at one pharmacy is somebody re-running the form and handing
    // out a password for an account that is already somebody else's.
    expect(owner).toContain("if (existing) {");
    expect(owner).toMatch(/already has a login/);
  });
});

describe("the sign-in address", () => {
  it("is configurable but never blank", () => {
    // Resceta is its own deployment, so the portal cannot build this from its
    // own host — and a partner reading a URL to somebody in front of them
    // needs one that works.
    expect(actions).toContain("process.env.NEXT_PUBLIC_RESCETA_URL");
    expect(actions).toContain('"https://resceta.vercel.app"');
  });

  it("is passed to the page, not assumed by it", () => {
    expect(actions).toContain("signInUrl: rescetaUrl()");
  });
});
