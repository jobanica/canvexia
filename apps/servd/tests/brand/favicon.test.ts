import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BAND, MARK_COLORS } from "@servd/ui";
import { partnerManifest } from "@/lib/partners/manifest";

/**
 * The favicon is the same drawing as the mark.
 *
 * A browser tab cannot render a React component, so the mark exists twice: as
 * `<Mark>` in packages/ui and as a static `icon.svg` per CANVEXIA surface. Two
 * copies of a logo is a logo that drifts — someone adjusts the geometry in one
 * place and the tab quietly keeps the old shape for months.
 *
 * These files were GENERATED from `BAND` and `MARK_COLORS`. This test is what
 * keeps that true.
 */

/**
 * ONE FILE PER APP, served from `public/brand`, not Next's per-segment
 * `icon.svg` convention. Declaring `icons` in a segment's metadata — which the
 * apple-touch-icon needs — suppresses that convention, so the tab kept showing
 * the root's Servd favicon while the iOS icon was already right.
 */
const SVGS = [
  join(__dirname, "../../public/brand/canvexia-mark.svg"),
  join(__dirname, "../../../www/public/brand/canvexia-mark.svg"),
];

describe("the CANVEXIA favicon", () => {
  it("exists in both apps that wear the CANVEXIA brand", () => {
    // /hq and /partner sit under a Servd root layout; canvexia.com is a
    // separate deployment and had no icon at all, falling back to a
    // /favicon.ico that app does not have.
    for (const file of SVGS) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it("is actually pointed at by every CANVEXIA layout", () => {
    // A file nothing references is the same as no file. Each of these declares
    // the icon EXPLICITLY, because declaring `icons` at all is what suppresses
    // Next's file convention.
    const layouts = [
      join(__dirname, "../../src/app/(platform)/hq/layout.tsx"),
      join(__dirname, "../../src/app/(platform)/partner/layout.tsx"),
      join(__dirname, "../../../www/src/app/layout.tsx"),
    ];
    for (const file of layouts) {
      const code = readFileSync(file, "utf8");
      expect(code, file).toContain('icon: [{ url: "/brand/canvexia-mark.svg"');
      expect(code, file).toContain('apple: "/brand/canvexia-180.png"');
    }
  });

  it("draws exactly the four bands the component draws", () => {
    for (const file of SVGS) {
      const svg = readFileSync(file, "utf8");
      for (const [name, d] of Object.entries(BAND)) {
        expect(svg, `${file} is missing the ${name} band`).toContain(`d="${d}"`);
      }
    }
  });

  it("uses the mark's own colours, gradient included", () => {
    for (const file of SVGS) {
      const svg = readFileSync(file, "utf8");
      expect(svg).toContain(MARK_COLORS.ink);
      expect(svg).toContain(MARK_COLORS.coral);
      expect(svg).toContain(MARK_COLORS.ember);
      // The gradient belongs to the upper-right band and nothing else.
      expect(svg).toContain(`d="${BAND.topRight}" fill="url(#`);
    }
  });

  it("keeps the 48-unit viewBox the geometry is drawn in", () => {
    // Every path coordinate is in 0–48. A different viewBox crops the mark.
    for (const file of SVGS) {
      expect(readFileSync(file, "utf8")).toContain('viewBox="0 0 48 48"');
    }
  });
});

describe("the CANVEXIA raster icons", () => {
  const PUBLIC = join(__dirname, "../../public/brand");
  const sizes = [
    ["canvexia-180.png", 180],
    ["canvexia-192.png", 192],
    ["canvexia-512.png", 512],
    ["canvexia-maskable-512.png", 512],
  ] as const;

  it("exists at every size the manifest and iOS ask for", () => {
    for (const [name] of sizes) {
      expect(existsSync(join(PUBLIC, name)), name).toBe(true);
    }
  });

  it("is really a PNG of the size it claims", () => {
    // The dimensions live in the IHDR chunk, bytes 16–23. A 512 named 192 is
    // the kind of thing only a phone notices, months later.
    for (const [name, size] of sizes) {
      const buf = readFileSync(join(PUBLIC, name));
      expect(buf.subarray(0, 8).toString("hex"), name).toBe("89504e470d0a1a0a");
      expect(buf.readUInt32BE(16), `${name} width`).toBe(size);
      expect(buf.readUInt32BE(20), `${name} height`).toBe(size);
    }
  });
});

describe("the field app a partner installs", () => {
  // Built per host now rather than read from public/ — an operator's branded
  // subdomain serves the portal at bare paths and needs a different scope. The
  // icons, which are what this file is about, are the same either way.
  const manifest = partnerManifest("field", false);

  it("is called CANVEXIA and carries CANVEXIA's icons", () => {
    // It was named "CANVEXIA Field" while pointing at Servd's icon files, so a
    // partner installing it got a competitor product's logo on their phone.
    expect(manifest.name).toContain("CANVEXIA");
    for (const icon of manifest.icons) {
      expect(icon.src, icon.src).toContain("canvexia");
    }
  });

  it("still offers a maskable icon, or Android crops the mark", () => {
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });
});

/**
 * The root favicon, and why it is gone.
 */
describe("no global favicon leaks onto a CANVEXIA page", () => {
  it("has no app/favicon.ico", () => {
    // Next emits the root favicon on EVERY page, including /hq and /partner.
    // With one there, those pages declared both marks and left the browser to
    // choose — which is not a thing to leave to a heuristic.
    expect(existsSync(join(__dirname, "../../src/app/favicon.ico"))).toBe(false);
  });

  it("makes Servd declare its own icon instead", () => {
    // Deleting the favicon only works if the Servd surfaces still have one.
    const root = readFileSync(join(__dirname, "../../src/app/layout.tsx"), "utf8");
    expect(root).toContain('icon: [{ url: "/brand/servd-icon.svg"');
    expect(root).toContain('apple: "/brand/icon-apple-180.png"');
  });
});
