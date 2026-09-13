import { describe, it, expect } from "vitest";
import {
  safeParseScript,
  enforceTypeInvariants,
  jabHasNoCta,
  scriptToMarkdown,
  type GeneratedScript,
} from "@/lib/content/script";

const validHook = {
  title: "Sample",
  hook: { visual: "v", audio: "a", textOverlay: "t" },
  body: [{ time: "0-3s", action: "act", line: "line" }],
  cta: { verbal: "DM us", text: "DM SERVD", action: "open dm" },
  production: { music: "upbeat", bRoll: "kitchen", graphics: "price" },
};

describe("safeParseScript", () => {
  it("parses a clean JSON object", () => {
    const r = safeParseScript(JSON.stringify(validHook));
    expect(r.ok).toBe(true);
  });

  it("tolerates ```json fences", () => {
    const r = safeParseScript("```json\n" + JSON.stringify(validHook) + "\n```");
    expect(r.ok).toBe(true);
  });

  it("tolerates surrounding prose", () => {
    const r = safeParseScript("Here you go:\n" + JSON.stringify(validHook) + "\nHope that helps!");
    expect(r.ok).toBe(true);
  });

  it("accepts a null cta (jab)", () => {
    const r = safeParseScript(JSON.stringify({ ...validHook, cta: null }));
    expect(r.ok).toBe(true);
  });

  it("fails on non-JSON without throwing", () => {
    const r = safeParseScript("totally not json");
    expect(r.ok).toBe(false);
  });

  it("fails validation on a missing required field", () => {
    const broken = { ...validHook };
    // @ts-expect-error — intentionally drop a required field
    delete broken.hook;
    const r = safeParseScript(JSON.stringify(broken));
    expect(r.ok).toBe(false);
  });
});

describe("framework invariants", () => {
  const script = validHook as GeneratedScript;

  it("strips the CTA from a jab", () => {
    const out = enforceTypeInvariants(script, "JAB");
    expect(out.cta).toBeNull();
    expect(jabHasNoCta(out)).toBe(true);
  });

  it("keeps the CTA on a right hook", () => {
    const out = enforceTypeInvariants(script, "RIGHT_HOOK");
    expect(out.cta).not.toBeNull();
  });
});

describe("scriptToMarkdown", () => {
  it("includes the title, hook, body and omits CTA for jabs", () => {
    const jab = enforceTypeInvariants(validHook as GeneratedScript, "JAB");
    const md = scriptToMarkdown(jab, { type: "JAB", platform: "reels", lengthSec: 30 });
    expect(md).toContain("# Sample");
    expect(md).toContain("## Hook");
    expect(md).toContain("## Body");
    expect(md).not.toContain("## Call to action");
  });

  it("includes the CTA for right hooks", () => {
    const md = scriptToMarkdown(validHook as GeneratedScript, { type: "RIGHT_HOOK" });
    expect(md).toContain("## Call to action");
    expect(md).toContain("DM SERVD");
  });
});
