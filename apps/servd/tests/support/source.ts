import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read a source file with its comments removed, so an assertion about the CODE
 * cannot be satisfied by a comment that merely mentions the thing.
 *
 * WHY THIS IS A SCANNER AND NOT TWO REGEXES.
 *
 * Every test file that needed this used to carry its own copy of:
 *
 *     src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
 *
 * which is wrong in a way that hides code rather than revealing it. `/*` inside
 * a STRING opens a comment as far as that regex is concerned, and FieldApp.tsx
 * contains this:
 *
 *     accept="image/&#42;"
 *
 * — the camera input's MIME filter. Everything from there to the next `&#42;/`
 * (thirty-odd lines, including the whole photo error handler) was deleted
 * before any test ever saw it. Assertions over that range could not fail; they
 * were asserting against an empty string.
 *
 * That is the worst failure mode a test helper has. A broken assertion that
 * fails gets fixed in a minute; one that silently passes is why somebody ships
 * the bug it was written to catch.
 *
 * So this tracks string state. It is not a TypeScript parser and does not need
 * to be — it needs to know that a `/` inside quotes is not a comment.
 */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    // Line comment — runs to the newline, which is kept so line-order
    // assertions (`indexOf(a) < indexOf(b)`) still mean something.
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }

    // Block comment. Newlines inside are preserved, for the same reason.
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }

    // A string literal is copied through verbatim, comment markers and all.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n) {
        if (src[i] === "\\") {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    out += c;
    i += 1;
  }

  return out;
}

/** `stripComments` over a path relative to the app root. */
export function codeAt(path: string): string {
  return stripComments(readFileSync(join(process.cwd(), path), "utf8"));
}
