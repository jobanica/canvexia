import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

/**
 * NOTHING ON THE SERVER MAY CALL A FUNCTION THAT LIVES PAST THE CLIENT BOUNDARY.
 *
 * REPORTED — clicking Adjustments gave "Application error: a server-side
 * exception has occurred", digest 597542042. The cause:
 *
 *   Attempted to call batchLabel() from the server but batchLabel is on the
 *   client.
 *
 * `batchLabel` was a pure string helper exported from `WriteoffForm.tsx`, which
 * begins `"use client"`. Next wraps EVERY export of a client module as a client
 * reference — a stub that exists to be serialised to the browser, not to be
 * called — so the server page importing it threw before rendering anything.
 * That page had 500ed since the day it was written, and nobody had clicked it.
 *
 * WHY NO TEST CAUGHT IT. Every page test in this suite reads the file as a
 * STRING and asserts on what it contains. A page that throws on every request
 * passes all of them. This one walks the import graph instead, which is the
 * only shape of test that could have seen it.
 *
 * The rule: a module WITHOUT `"use client"` may import from a module WITH it
 * only Components (capitalised) and types. A lowercase value is a function or
 * constant somebody will eventually call, and calling it is a 500.
 */

const SRC = resolve(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const isClientModule = (path: string) => {
  try {
    return /^\s*["']use client["']/.test(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
};

/** Resolve an import specifier to a file on disk, or null if it is a package. */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

interface Offence {
  from: string;
  imports: string;
  binding: string;
}

function findOffences(): Offence[] {
  const offences: Offence[] = [];
  const IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;

  for (const file of files) {
    if (isClientModule(file)) continue; // client importing client is fine
    const source = readFileSync(file, "utf8");

    for (const m of source.matchAll(IMPORT)) {
      const [, typeOnly, bindings, spec] = m;
      if (typeOnly) continue; // types are erased; they never cross anything

      const target = resolveImport(file, spec!);
      if (!target || !isClientModule(target)) continue;

      for (const raw of bindings!.split(",")) {
        const binding = raw.trim();
        if (binding === "" || binding.startsWith("type ")) continue;
        const name = (binding.split(/\s+as\s+/)[0] ?? "").trim();
        // A Component is the ONE thing a server module may take across: React
        // renders it, it is never called as a function here.
        if (name === "" || /^[A-Z]/.test(name)) continue;
        offences.push({
          from: file.slice(SRC.length + 1),
          imports: spec!,
          binding: name,
        });
      }
    }
  }
  return offences;
}

describe("the client boundary", () => {
  it("finds client modules at all, so this test cannot pass vacuously", () => {
    // A guard that silently stops looking is worse than no guard.
    expect(files.filter(isClientModule).length).toBeGreaterThan(10);
  });

  it("resolves the app's own imports, so it is actually walking the graph", () => {
    const page = join(SRC, "app/inventory/page.tsx");
    expect(resolveImport(page, "./WriteoffForm")).toBe(
      join(SRC, "app/inventory/WriteoffForm.tsx"),
    );
    expect(resolveImport(page, "@/lib/pharmacy/batch-label")).toBe(
      join(SRC, "lib/pharmacy/batch-label.ts"),
    );
  });

  it("no server module imports a callable value from a client module", () => {
    const offences = findOffences();
    expect(
      offences,
      offences
        .map((o) => `${o.from} imports { ${o.binding} } from "${o.imports}" ("use client")`)
        .join("\n"),
    ).toEqual([]);
  });

  it("catches the exact import that broke Adjustments", () => {
    // Proving the guard works, rather than trusting an empty list.
    const page = join(SRC, "app/inventory/page.tsx");
    const form = join(SRC, "app/inventory/WriteoffForm.tsx");
    expect(isClientModule(form)).toBe(true);
    expect(isClientModule(page)).toBe(false);
    // The helper moved out of the client module entirely.
    expect(readFileSync(form, "utf8")).not.toMatch(/export function batchLabel/);
    expect(readFileSync(page, "utf8")).toMatch(
      /import \{ batchLabel \} from "@\/lib\/pharmacy\/batch-label"/,
    );
  });
});
