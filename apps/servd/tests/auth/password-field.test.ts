import { describe, it, expect } from "vitest";
import { codeAt } from "../support/source";

/**
 * EVERY DOOR HAS THE SAME TWO AFFORDANCES.
 *
 * REPORTED — "in all the login details, add a show password and forgot
 * password." Three of the four had one or the other. The partner form had the
 * link and no toggle; HQ had the toggle and no link, and no reset route to put
 * behind one; the staff dashboard had both, hand-rolled, which is how the
 * other two drifted. Every screen that SETS a password — accepting an invite,
 * the reset page, signup, claiming a build — made people type it twice blind.
 *
 * One component, so a fix lands everywhere and a new door cannot be built
 * missing half of it.
 */

const FIELD = codeAt("src/components/auth/PasswordField.tsx");

/** Sign-in screens: both affordances. */
const LOGINS: Record<string, { file: string; forgot: string }> = {
  "the partner portal": {
    file: "src/components/partner/PartnerLoginForm.tsx",
    forgot: "/partner/forgot-password",
  },
  "the HQ console": {
    file: "src/components/hq/HqLoginForm.tsx",
    forgot: "/hq/forgot-password",
  },
  "the staff dashboard": {
    file: "src/app/(platform)/login/page.tsx",
    forgot: "/forgot-password",
  },
};

/** Screens that CHOOSE a password: the toggle, and no "forgot" — see below. */
const SETTERS: Record<string, string> = {
  "accepting a partner invite": "src/components/partner/AcceptInvite.tsx",
  "the reset-password page": "src/app/(platform)/reset-password/page.tsx",
  "signing up": "src/app/(platform)/signup/SignupForm.tsx",
  "claiming a build": "src/components/build/ClaimForm.tsx",
};

describe("every sign-in screen has both", () => {
  for (const [name, { file, forgot }] of Object.entries(LOGINS)) {
    it(`${name} uses the shared field and points at its own reset`, () => {
      const src = codeAt(file);
      expect(src).toContain("<PasswordField");
      expect(src).toContain(`forgotHref="${forgot}"`);
    });

    it(`${name} has no hand-rolled password input left`, () => {
      // A second implementation is how these got out of step in the first
      // place.
      expect(codeAt(file), name).not.toContain('type="password"');
    });
  }

  it("HQ's reset link points at a route that exists, with an action behind it", () => {
    // It had neither. An ops admin who forgot their password had to find
    // somebody with database access.
    expect(() => codeAt("src/app/(platform)/hq/forgot-password/page.tsx")).not.toThrow();
    expect(codeAt("src/server/hq/login-action.ts")).toContain(
      "export async function requestHqPasswordReset",
    );
  });

  it("HQ's reset does not say whether the address exists", () => {
    // Otherwise the form becomes a way to enumerate who works here.
    const action = codeAt("src/server/hq/login-action.ts");
    const fn = action.slice(action.indexOf("export async function requestHqPasswordReset"));
    expect(fn).toContain("return { ok: true };");
    expect(fn).not.toContain("no HQ account");
  });

  it("HQ's reset link lands on a path the middleware lets through", () => {
    // /reset-password is in PASS_THROUGH, so it answers on a CANVEXIA host
    // instead of being prefixed with /partner.
    const fn = codeAt("src/server/hq/login-action.ts");
    expect(fn).toContain("/reset-password?next=");
    expect(codeAt("src/middleware.ts")).toContain('"/reset-password"');
  });
});

describe("every screen that chooses a password can show it", () => {
  for (const [name, file] of Object.entries(SETTERS)) {
    it(`${name} uses the shared field`, () => {
      expect(codeAt(file)).toContain("<PasswordField");
      expect(codeAt(file), name).not.toContain('type="password"');
    });

    it(`${name} offers no "forgot password"`, () => {
      // You are not forgetting one you are in the middle of choosing.
      expect(codeAt(file), name).not.toContain("forgotHref");
    });
  }
});

describe("the field itself", () => {
  it("starts hidden", () => {
    expect(FIELD).toContain("useState(false)");
  });

  it("does not remember the choice between loads", () => {
    // A password box that stays visible because of something you did last week
    // is a surprise, and the only storage that survives a reload is shared with
    // whoever else uses the device.
    expect(FIELD).not.toContain("localStorage");
    expect(FIELD).not.toContain("sessionStorage");
  });

  it("says what the button does rather than repeating its own text", () => {
    expect(FIELD).toContain('aria-label={show ? "Hide password" : "Show password"}');
    expect(FIELD).toContain("aria-pressed={show}");
  });

  it("leaves room for the toggle", () => {
    // Without the padding it sits on top of the last characters — the exact
    // thing somebody turned it on to read.
    expect(FIELD).toContain("pr-16");
  });

  it("ties the label to the input", () => {
    expect(FIELD).toContain("const id = useId()");
    expect(FIELD).toContain("htmlFor={id}");
  });
});
