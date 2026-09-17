import { describe, it, expect } from "vitest";
import { contrast, darkenToContrast } from "@servd/core";
import { partnerBrandVars } from "@/lib/partners/brand-vars";
import { codeAt } from "../support/source";

/**
 * A BRAND SETTING THAT CHANGES NOTHING IS NOT A SETTING.
 *
 * REPORTED — "already changed the color branding, but the color of my dashboard
 * did not change." It could not have. Every partner route is wrapped in
 * `.brand-canvexia`, which pins the five `--brand-*` variables to CANVEXIA's
 * palette, and the only thing in the codebase reading `brandConfig` was the
 * merchant invoice. Two colour pickers, a Save button, a "Saved" message, and
 * no screen anywhere that looked different afterwards.
 *
 * Same family as the nav that truncated at five and the HQ list with no way to
 * add a partner: the product said yes and nothing happened.
 */

describe("a partner's colours reach the variables the design system reads", () => {
  it("writes the same two custom properties .brand-canvexia sets", () => {
    const vars = partnerBrandVars({ primaryColor: "#0F62FE", accentColor: "#00B37E" }) as Record<
      string,
      string
    >;
    expect(vars["--brand-primary"]).toBeTruthy();
    expect(vars["--brand-accent"]).toBe("#00B37E");
  });

  it("leaves CANVEXIA's palette alone for an unbranded partner", () => {
    // Writing nothing is what makes the class underneath still apply. An empty
    // string would blank the variable and paint a colourless portal.
    expect(partnerBrandVars({ primaryColor: null, accentColor: null })).toEqual({});
  });

  it("ignores a stored value that is not a colour", () => {
    // A variable set to garbage paints nothing and is invisible to debug, so
    // the fallback has to be "don't write it".
    expect(partnerBrandVars({ primaryColor: "chartreuse", accentColor: "rgb(1,2,3)" })).toEqual({});
  });

  it("darkens a primary too light to read, and says the hue survives", () => {
    const pale = "#FFE14D";
    expect(contrast(pale, "#FFFFFF")!.passesAA).toBe(false);
    const vars = partnerBrandVars({ primaryColor: pale, accentColor: null }) as Record<
      string,
      string
    >;
    expect(vars["--brand-primary"]).toBe(darkenToContrast(pale));
    expect(contrast(vars["--brand-primary"], "#FFFFFF")!.passesAA).toBe(true);
  });

  it("does not touch a primary that already reads", () => {
    const vars = partnerBrandVars({ primaryColor: "#0F62FE", accentColor: null }) as Record<
      string,
      string
    >;
    expect(vars["--brand-primary"].toLowerCase()).toBe("#0f62fe");
  });

  it("does not darken the accent", () => {
    // It is used for tints and small marks, not for text. Dragging it down
    // would collapse two colours a partner chose to be different.
    const vars = partnerBrandVars({ primaryColor: null, accentColor: "#FFE14D" }) as Record<
      string,
      string
    >;
    expect(vars["--brand-accent"]).toBe("#FFE14D");
  });
});

describe("every partner surface carries them", () => {
  const SURFACES: Record<string, string> = {
    "the portal shell": "src/components/partner/PortalShell.tsx",
    "the field app": "src/app/(platform)/partner/attendance/page.tsx",
    "the brand editor itself": "src/app/(platform)/partner/brand/page.tsx",
  };

  for (const [name, path] of Object.entries(SURFACES)) {
    it(`${name} applies partnerBrandVars`, () => {
      expect(codeAt(path)).toContain("partnerBrandVars(partner.brand)");
    });
  }

  it("HQ does not", () => {
    // /hq reads across every partner at once. Wearing one operator's colours
    // there would be actively misleading about whose data is on screen.
    const hq = codeAt("src/components/hq/HqShell.tsx");
    expect(hq).not.toContain("partnerBrandVars");
    expect(hq).toContain("brand-canvexia");
  });

  it("carries the colours on the session rather than re-querying per screen", () => {
    const auth = codeAt("src/server/partners/auth.ts");
    // All three sign-in paths — impersonation, seat, legacy.
    expect(auth.split("brandConfig: true").length - 1).toBe(3);
    expect(auth.split("brand: brandOf(brandConfig)").length - 1).toBe(3);
  });
});

describe("the corner of the portal says whose it is", () => {
  const lockup = codeAt("src/components/partner/PartnerLockup.tsx");
  const shell = codeAt("src/components/partner/PortalShell.tsx");

  it("prefers an uploaded logo, then the trading name, then CANVEXIA", () => {
    // Order matters: the logo is the thing they went to the trouble of making.
    const logo = lockup.indexOf("partner.brand.logoUrl ?");
    const name = lockup.indexOf(") : name ? (");
    const fallback = lockup.indexOf('title="CANVEXIA"');
    expect(logo).toBeGreaterThan(-1);
    expect(name).toBeGreaterThan(logo);
    expect(fallback).toBeGreaterThan(name);
  });

  it("still shows CANVEXIA for a partner who has set nothing", () => {
    // The default experience is unchanged. A blank corner where a logo should
    // be is worse than one that never claimed to be theirs.
    expect(lockup).toContain("<Mark size={md ? 26 : 24} title=\"CANVEXIA\" />");
  });

  it("is the only lockup the shell draws, at all three sizes", () => {
    // Sidebar, top bar and drawer. Three copies is three places to forget.
    expect(shell.split("<PartnerLockup").length - 1).toBe(3);
    expect(shell, "a hard-coded CANVEXIA wordmark is back").not.toContain(
      'tracking-[0.12em] text-brand-ink">CANVEXIA',
    );
  });

  it("agrees with the name printed on the other side of the bar", () => {
    expect(shell).toContain("partner.brand.displayName?.trim() || partner.name");
  });

  it("does not stretch a logo of an awkward shape", () => {
    expect(lockup).toContain("object-contain");
  });
});

describe("the editor says what will happen before it happens", () => {
  const field = codeAt("src/components/partner/ColourField.tsx");
  const page = codeAt("src/app/(platform)/partner/brand/page.tsx");
  const form = codeAt("src/components/partner/PartnerBrandForm.tsx");

  it("shows the contrast ratio on the primary colour", () => {
    expect(form).toContain("checkContrast");
    expect(field).toContain('contrast(value.trim(), "#FFFFFF")');
  });

  it("names the colour it will actually use when it adjusts one", () => {
    // Silently shipping a different colour than the one in the picker is the
    // bug report this line exists to prevent.
    expect(field).toContain("too light to read");
    expect(field).toContain("{adjusted}");
  });

  it("stops claiming the merchant dashboards are branded", () => {
    // They are not. The only merchant-facing surface reading brandConfig is the
    // invoice, and the page said "your merchants see your brand" flatly.
    expect(page).not.toContain("Your merchants see your brand");
    expect(page).toContain("still show Servd");
  });
});
