import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Turborepo 2 runs tasks in **strict** env mode: a task only sees the variables
 * its config declares. A variable read by the source but missing from
 * `turbo.json` is therefore two bugs at once — it is absent from the build
 * environment, and it is absent from the cache key, so changing it in the
 * dashboard does not invalidate anything and a redeploy silently serves the
 * previous build.
 *
 * Both failures are invisible: nothing errors, the value is just `undefined`.
 * `NEXT_PUBLIC_PARTNER_ROOT_DOMAIN` going missing this way does not break the
 * build — it makes `canvexia.com` stop being recognised as the partner root and
 * fall through to Servd's restaurant marketing, which is a routing bug found by
 * a human visiting the page.
 *
 * So the list is derived from the source rather than maintained by hand.
 */

const ROOT = join(process.cwd(), "../..");

/** Variables Vercel/Node set themselves, declared in `globalEnv` or implicit. */
const AMBIENT = new Set([
  "CI",
  "NEXT_TELEMETRY_DISABLED",
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "npm_lifecycle_event",
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(path);
  }
  return out;
}

/** Every `process.env.X` the shipped source reads, and where. */
function readsByVariable(): Map<string, string[]> {
  const roots = [
    join(ROOT, "apps/servd/src"),
    join(ROOT, "apps/reseta/src"),
    join(ROOT, "packages/core/src"),
  ];
  const found = new Map<string, string[]>();
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = match[1];
        if (AMBIENT.has(name)) continue;
        const where = file.slice(ROOT.length + 1);
        const seen = found.get(name) ?? [];
        if (!seen.includes(where)) seen.push(where);
        found.set(name, seen);
      }
    }
  }
  return found;
}

// Parsed as strict JSON on purpose. Turborepo accepts comments in turbo.json;
// this test does not, so the file stays machine-readable and a stray `//`
// fails here rather than in whatever else grows to read it.
const turbo = JSON.parse(readFileSync(join(ROOT, "turbo.json"), "utf8"));
const declared: string[] = turbo.tasks.build.env;

describe("turbo.json declares every variable the build reads", () => {
  it("has no undeclared variable", () => {
    const missing = [...readsByVariable()]
      .filter(([name]) => !declared.includes(name))
      .map(([name, files]) => `${name} (read in ${files[0]})`);

    expect(missing).toEqual([]);
  });

  it("has no variable nothing reads", () => {
    // A stale entry is harmless at runtime but misleads whoever is setting up
    // the project — it reads as "this must be configured".
    const reads = readsByVariable();
    const orphans = declared.filter((name) => !reads.has(name));

    expect(orphans).toEqual([]);
  });

  it("is sorted, so additions land in one obvious place", () => {
    expect(declared).toEqual([...declared].sort());
  });
});

describe("turbo.json lets the DB-backed suites actually run", () => {
  // Every isolation suite is `hasDb ? describe : describe.skip`. Under strict
  // env mode a `test` task that does not declare DATABASE_URL never sees it, so
  // all 79 of them skip themselves and the run reports green having tested
  // nothing — which is worse than 79 failures, because nobody investigates a
  // pass.
  it("declares the database connection on the test task", () => {
    expect(turbo.tasks.test.env).toContain("DATABASE_URL");
    expect(turbo.tasks.test.env).toContain("DIRECT_URL");
  });
});
