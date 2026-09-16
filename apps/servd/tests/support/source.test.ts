import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments, codeAt } from "./source";

/**
 * The helper that reads source for the file-shape tests, and the bug it
 * replaces.
 */
describe("stripComments", () => {
  it("removes line and block comments", () => {
    expect(stripComments("const a = 1; // nope\n")).toBe("const a = 1; \n");
    expect(stripComments("a /* nope */ b")).toBe("a  b");
    expect(stripComments("/** doc */\nconst a = 1;")).toBe("\nconst a = 1;");
  });

  it("keeps newlines, so order assertions still mean something", () => {
    // `indexOf(a) < indexOf(b)` is only meaningful if the layout survives.
    expect(stripComments("a\n/* one\ntwo\nthree */\nb").split("\n")).toHaveLength(5);
  });

  it("does NOT treat a slash-star inside a string as a comment", () => {
    // THE BUG. `accept="image/*"` in FieldApp.tsx opened a comment that the old
    // regex then closed at the next `*/` thirty lines later, deleting the whole
    // photo error handler before any assertion saw it.
    const src = 'a = "image/*";\nconst keep = 1;\n/* gone */\nconst also = 2;';
    const out = stripComments(src);
    expect(out).toContain('"image/*"');
    expect(out).toContain("const keep = 1;");
    expect(out).toContain("const also = 2;");
    expect(out).not.toContain("gone");
  });

  it("is not fooled by a comment marker in single quotes or a template", () => {
    expect(stripComments("a = '// not a comment';")).toContain("// not a comment");
    expect(stripComments("a = `/* nor this */`;")).toContain("/* nor this */");
  });

  it("handles an escaped quote inside a string", () => {
    const src = 'a = "he said \\"/*\\" loudly"; const b = 1;';
    expect(stripComments(src)).toContain("const b = 1;");
  });

  it("proves the real file is no longer being truncated", () => {
    // The concrete regression: this handler sits after `accept="image/*"` and
    // was invisible to every assertion in visit-proof.test.ts.
    const form = codeAt("src/components/partner/FieldApp.tsx");
    expect(form).toContain('accept="image/*"');
    expect(form).toContain("err instanceof Error && err.message");
    // And the comments really are gone.
    expect(form).not.toContain("THE BUG THIS EXISTS FOR");
  });

  it("the old regex pair would have failed that", () => {
    // Kept as evidence rather than prose: if someone reinstates the old helper,
    // this is the test that says why they should not.
    const raw = readFileSync(
      join(process.cwd(), "src/components/partner/FieldApp.tsx"),
      "utf8",
    );
    const old = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(old).not.toContain("err instanceof Error && err.message");
  });
});
