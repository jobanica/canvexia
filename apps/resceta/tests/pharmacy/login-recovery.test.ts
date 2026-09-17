import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THERE WAS NO WAY BACK IN.
 *
 * Resceta's sign-in had no Show-password toggle, no "Forgot password?" link,
 * and no reset route at all. Combined with the absence of any self-serve login
 * handover on the partner side, a pharmacy owner who forgot their password had
 * exactly one recovery path: the `staff:create` CLI script, run by whoever
 * holds the service-role key.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("signing in", () => {
  const form = src("app/login/LoginForm.tsx");

  it("can show the password", () => {
    expect(form).toContain("<PasswordField");
    expect(form).not.toContain('type="password"');
  });

  it("offers a way to recover one", () => {
    expect(form).toContain('href="/forgot-password"');
  });

  it("still refuses to say which half was wrong", () => {
    // Which one it is tells an attacker whether an address is staff here.
    expect(form).toContain("That email and password don't match.");
  });
});

describe("the recovery flow exists end to end", () => {
  it("has both pages", () => {
    expect(() => src("app/forgot-password/page.tsx")).not.toThrow();
    expect(() => src("app/reset-password/page.tsx")).not.toThrow();
  });

  it("sends the link to the host the person is standing on", () => {
    // This app deliberately builds no absolute URLs, and for a pharmacy that
    // later gets its own domain the right destination is the one they know.
    expect(src("app/forgot-password/page.tsx")).toContain(
      "`${window.location.origin}/reset-password`",
    );
  });

  it("reports success whether or not the address exists", () => {
    // Otherwise the form is a way to find out who is staff here.
    //
    // Asserted on the STRUCTURE rather than on the absence of a phrase: the
    // first version of this test forbade the string "No account" and failed
    // against the comment in that file explaining why it must not appear,
    // which is a test measuring its own documentation.
    const page = src("app/forgot-password/page.tsx");
    expect(page).toContain("If an account exists for that address");
    // The success state is set after the try/catch, so a thrown error and a
    // clean send reach it identically. Nothing branches on the result.
    const call = page.indexOf("resetPasswordForEmail");
    const swallow = page.indexOf("} catch {", call);
    const succeed = page.indexOf("setSent(true)", swallow);
    expect(call).toBeGreaterThan(-1);
    expect(swallow).toBeGreaterThan(call);
    expect(succeed).toBeGreaterThan(swallow);
    expect(page).not.toContain("if (error)");
  });

  it("keeps the password out of any request this app could log", () => {
    // Straight to Supabase from the browser, matching the sign-in form — never
    // through a Server Action body.
    expect(src("app/reset-password/page.tsx")).toContain("supabase.auth.updateUser({ password })");
    expect(src("app/reset-password/page.tsx")).not.toContain('"use server"');
  });
});

describe("an expired link says so before the form", () => {
  const page = src("app/reset-password/page.tsx");

  it("checks for a session first", () => {
    // Without this somebody types a new password twice and is told "Auth
    // session missing", which reads as the app being broken.
    expect(page).toContain('"checking" | "ok" | "no-session"');
    expect(page).toContain("This link has expired");
  });

  it("waits for the fragment exchange rather than reading the session on mount", () => {
    // Supabase puts the recovery token in the URL fragment and swaps it for a
    // session asynchronously. Reading synchronously finds nothing and shows the
    // expired message to somebody whose link is fine.
    expect(page).toContain("onAuthStateChange");
  });

  it("makes the two boxes agree before it saves", () => {
    expect(page).toContain("Those two don't match.");
  });
});

describe("the field itself", () => {
  const field = src("components/PasswordField.tsx");

  it("starts hidden and is not remembered", () => {
    expect(field).toContain("useState(false)");
    expect(field).not.toContain("localStorage");
  });

  it("labels the button by what it does", () => {
    expect(field).toContain('aria-label={show ? "Hide password" : "Show password"}');
  });

  it("leaves room for the toggle", () => {
    // Without it the button sits on the characters somebody turned it on to
    // read.
    expect(field).toContain("pr-16");
  });
});
