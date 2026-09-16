import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PASS_THROUGH, ROOT_ONLY_PASS_THROUGH } from "@/middleware";
import { partnerUrl, platformUrl } from "@/lib/urls";

/**
 * Links that land on the PARTNER host.
 *
 * THE BUG THIS EXISTS FOR, found the hour `partner.canvexia.com` went live: on
 * a partner host the middleware prefixes `/partner` onto every path it does not
 * recognise, so `/invite/<token>` — the link in every staff invitation —
 * resolved to `/partner/invite/<token>` and 404'd. `/reset-password` did the
 * same.
 *
 * And the fix that was worse than the bug: pointing `NEXT_PUBLIC_APP_URL` at
 * the partner host to make those links right ALSO moved every merchant link —
 * a restaurant owner's `/claim/<token>` and `/login` — onto CANVEXIA's partner
 * domain, where they 404 and where they would be the wrong brand even if they
 * did not. One deployment serves two products; one variable cannot be both.
 */

const SRC = join(__dirname, "../../src");
const codeOf = (p: string) => readFileSync(join(SRC, p), "utf8");
const allowed = (path: string) => PASS_THROUGH.some((p) => path.startsWith(p));

describe("the two bases", () => {
  it("keeps them separate, and falls back rather than breaking a deployment", () => {
    // Every preview, and production before the domain existed, sets only
    // NEXT_PUBLIC_APP_URL. Those must keep working unchanged.
    const before = process.env.NEXT_PUBLIC_PARTNER_URL;
    delete process.env.NEXT_PUBLIC_PARTNER_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
    expect(partnerUrl()).toBe("https://example.test");
    expect(platformUrl()).toBe("https://example.test");

    process.env.NEXT_PUBLIC_PARTNER_URL = "https://partner.example.test/";
    expect(partnerUrl()).toBe("https://partner.example.test"); // trailing slash trimmed
    expect(platformUrl()).toBe("https://example.test");
    if (before === undefined) delete process.env.NEXT_PUBLIC_PARTNER_URL;
    else process.env.NEXT_PUBLIC_PARTNER_URL = before;
  });
});

describe("partner-facing links use the partner base", () => {
  const cases: { file: string; needle: string }[] = [
    // The invitation link, and the sign-in line in a welcome email.
    { file: "server/email/outbox.ts", needle: "partnerUrl()" },
    // The partner password reset.
    { file: "server/partners/login-action.ts", needle: "partnerUrl()" },
    // The kiosk QR, which a phone camera opens.
    { file: "app/api/partner/kiosk/code/route.ts", needle: "partnerUrl()" },
  ];

  for (const c of cases) {
    it(`${c.file} builds its links from the portal host`, () => {
      const code = codeOf(c.file);
      expect(code).toContain(c.needle);
      // …and does NOT reach for the raw platform variable, which is the merchant
      // product's address.
      expect(code).not.toContain("process.env.NEXT_PUBLIC_APP_URL");
    });
  }
});

describe("merchant links stay on the merchant host", () => {
  it("still builds claim and sign-in links from the platform base", () => {
    // A restaurant owner claiming their storefront must not be sent to
    // CANVEXIA's partner domain.
    const code = codeOf("server/email/transactional.ts");
    expect(code).toContain("process.env.NEXT_PUBLIC_APP_URL");
    expect(code).not.toContain("partnerUrl(");
  });
});

describe("every path we send somebody to on the partner host", () => {
  /**
   * Listed by hand, deliberately.
   *
   * An earlier version of this test scanned for `${base}/…` across all of src
   * and flagged twenty-six paths, nearly all of them screen links on the
   * merchant host that have nothing to do with this rule. A list that cries
   * wolf gets deleted; this one is short because the rule is narrow.
   */
  const partnerFacing = ["/invite/abc123", "/reset-password", "/l/tagum", "/partner/login"];

  it("survives the /partner prefix", () => {
    const offenders = partnerFacing.filter((p) => !allowed(p));
    expect(
      offenders,
      "these are reachable on the portal host and would be rewritten to " +
        "/partner/… and 404. Add the prefix to PASS_THROUGH in src/middleware.ts.",
    ).toEqual([]);
  });

  it("does not exempt so much that the portal stops working", () => {
    for (const path of ["/", "/team", "/merchants", "/sms/contacts"]) {
      expect(allowed(path), path).toBe(false);
    }
  });

  it("does not exempt a path by accidental prefix match", () => {
    // The trailing slashes matter: a future "/invitees" page must not be swept
    // in by "/invite".
    expect(allowed("/invitees")).toBe(false);
    expect(allowed("/unsubscribed")).toBe(false);
  });
});

/**
 * CANVEXIA's own console, on CANVEXIA's own host — and not on an operator's.
 */
describe("/hq on the partner domain", () => {
  const rootOnly = (path: string) =>
    ROOT_ONLY_PASS_THROUGH.some((p) => path.startsWith(p));

  it("passes through on the portal root, so HQ has a CANVEXIA address", () => {
    // Otherwise configuring CANVEXIA's own email means signing into Servd's
    // admin on a *.vercel.app URL, which is how this was found.
    expect(rootOnly("/hq")).toBe(true);
    expect(rootOnly("/hq/settings/email")).toBe(true);
  });

  it("is NOT in the list that applies to an operator's own subdomain", () => {
    // davao.canvexia.com is that operator's branded portal. CANVEXIA's HQ login
    // appearing there would be role-gated, harmless, and still wrong.
    expect(PASS_THROUGH).not.toContain("/hq");
  });
});
