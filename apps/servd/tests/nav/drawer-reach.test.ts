import { describe, it, expect } from "vitest";
import { codeAt } from "../support/source";

/**
 * EVERY SECTION A SEAT MAY OPEN IS REACHABLE ON A PHONE.
 *
 * REPORTED — "instead of putting the options down, put it in the left, with
 * hamburger button so all functions can be opened."
 *
 * The bottom bar rendered `[...main, ...secondary].slice(0, 5)`. The partner
 * nav runs to fourteen entries and HQ's to ten, so on a phone everything past
 * the fifth had no control anywhere: the sidebar holding it is `lg:flex`.
 * Brand, Domains, Commissions, Team and Settings were reachable only by typing
 * a URL — not hidden by a permission, hidden by a slice, silently, from people
 * who held the permission.
 *
 * This is the same defect as a disabled button that will not say why and a
 * dropdown with no way to add a business: THE RULE SAYS YES AND THE SCREEN
 * OFFERS NOTHING. seat-reach.test.ts pins it for one permission; this pins it
 * for the nav itself.
 *
 * Read as source rather than rendered because the failure is structural — a
 * rendering test would need a viewport, and the bug was a constant.
 */

const SHELLS = {
  "the partner portal": "src/components/partner/PortalShell.tsx",
  "the HQ console": "src/components/hq/HqShell.tsx",
} as const;

describe("no shell truncates its own navigation", () => {
  for (const [name, path] of Object.entries(SHELLS)) {
    it(`${name} shows every permitted item, not the first five`, () => {
      const shell = codeAt(path);
      // A slice on either nav array, in any spelling. Scoped to those two
      // names on purpose: `.slice(0, 2)` on the avatar initials is fine and an
      // unscoped match would have to be loosened the first time it fired,
      // which is how a test stops meaning anything.
      expect(shell, "a slice is back in the nav").not.toMatch(
        /\b(main|secondary|items|lower)\b[^\n;]*\.slice\(/,
      );
      expect(shell).not.toContain("...main, ...secondary");
    });

    it(`${name} has no fixed bottom bar left`, () => {
      const shell = codeAt(path);
      // `fixed inset-x-0 bottom-0` was the bar. Its padding compensation
      // (`pb-20`) goes with it, or the page keeps a dead band at the bottom.
      expect(shell).not.toContain("inset-x-0 bottom-0");
      expect(shell).not.toContain("pb-20");
    });

    it(`${name} opens the drawer from a hamburger, only where there is no sidebar`, () => {
      const shell = codeAt(path);
      expect(shell).toContain("<NavDrawer");
      // The sidebar is `lg:flex`; the button must be hidden exactly there, or
      // a desktop gets two navs.
      const at = shell.indexOf("<NavDrawer");
      expect(shell.slice(Math.max(0, at - 200), at)).toContain("lg:hidden");
    });
  }
});

describe("the field app carries the same drawer", () => {
  const page = codeAt("src/app/(platform)/partner/attendance/page.tsx");
  const app = codeAt("src/components/partner/FieldApp.tsx");

  it("builds it from the shared nav, not a second list", () => {
    // Two lists is two things to keep in step, and the field app is where a
    // permission added to the portal would be noticed last.
    expect(page).toContain("partnerNav(partner)");
    expect(page).toContain("<NavGroups main={nav.main} secondary={nav.secondary} />");
  });

  it("hands it down as a node, because the permissions are server knowledge", () => {
    expect(app).toContain("nav?: React.ReactNode");
    expect(app).toContain("{nav}");
  });

  it("keeps the one-tap way out beside it", () => {
    // The drawer's Overview would do it in two taps. Leaving is the thing
    // people do here in a hurry, and this link is why they stopped being
    // stranded on the installed app's start_url.
    expect(app).toContain('href="/partner"');
    expect(app).toContain("Portal");
  });
});

describe("the drawer can always be closed", () => {
  const drawer = codeAt("src/components/nav/NavDrawer.tsx");

  it("closes on a completed navigation", () => {
    // Next keeps it mounted across a route change inside the same layout.
    expect(drawer).toContain("usePathname()");
    expect(drawer).toMatch(/setOpen\(false\);\s*\n\s*\},\s*\[pathname\]\)/);
  });

  it("closes on a tap inside the panel, for a link to the current page", () => {
    // A pathname that does not change fires no effect, and the drawer would
    // sit there looking broken.
    const panel = drawer.slice(drawer.indexOf('role="dialog"'));
    expect(panel).toContain("onClick={() => setOpen(false)}");
  });

  it("closes on the backdrop and on Escape", () => {
    expect(drawer).toContain('e.key === "Escape"');
    expect(drawer).toContain('className="absolute inset-0 bg-brand-ink/45"');
  });

  it("restores the page's own scrolling when it goes", () => {
    // Left locked, the page behind is frozen and nothing on screen says why.
    expect(drawer).toContain("document.body.style.overflow = prev");
  });

  it("does not vanish out from under whoever opened it", () => {
    // The overlay carried `lg:hidden` at first. A panel open on a rotating
    // tablet would disappear mid-tap.
    const overlay = drawer.slice(drawer.indexOf("{open && ("));
    expect(overlay.slice(0, 600)).toContain('className="fixed inset-0 z-50"');
  });
});
