import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * "View as partner" is the most dangerous thing in the HQ console: it puts HQ
 * inside an operator's own console by design. These are the assertions that say
 * read-only is actually read-only.
 *
 * The modules are mocked rather than hit: `getImpersonation` reads a cookie and
 * a row, and neither is available in this sandbox. What is being tested is the
 * DECISION — given an impersonated session, does the write gate refuse — which
 * is the part that would be wrong.
 */

const getImpersonation = vi.fn();
const findUnique = vi.fn();
const authGetUser = vi.fn();

vi.mock("@/server/hq/impersonate", () => ({
  getImpersonation: () => getImpersonation(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: () => authGetUser() } }),
}));

vi.mock("@/server/tenancy/scoped-db", () => ({
  systemDb: (fn: (tx: unknown) => unknown) =>
    fn({
      partner: { findUnique: (...a: unknown[]) => findUnique(...a) },
      partnerUser: { findUnique: () => null },
    }),
}));

const PARTNER = {
  id: "p-1",
  name: "Cebu",
  email: "cebu@example.test",
  status: "approved",
  tier: "operator",
  revenueSharePct: 70,
};

beforeEach(() => {
  vi.resetModules();
  getImpersonation.mockReset();
  findUnique.mockReset();
  authGetUser.mockReset();
  authGetUser.mockResolvedValue({ data: { user: null } });
});

describe("an impersonated session", () => {
  beforeEach(() => {
    getImpersonation.mockResolvedValue({
      grantId: "g-1",
      partnerId: "p-1",
      hqAdminEmail: "hq@canvexia.test",
      expiresAt: new Date(Date.now() + 60_000),
      readOnly: true,
    });
    findUnique.mockResolvedValue(PARTNER);
  });

  it("resolves the partner WITHOUT the HQ user holding a partner login", async () => {
    // The HQ admin is signed in as an HQ Supabase user — `authGetUser` returns
    // nobody here on purpose. If the impersonation path were checked after the
    // Supabase lookup instead of before it, this would be null and the whole
    // feature would silently not work.
    const { getCurrentPartner } = await import("@/server/partners/auth");
    const partner = await getCurrentPartner();
    expect(partner?.id).toBe("p-1");
    expect(authGetUser).not.toHaveBeenCalled();
  });

  it("says who is looking, so the portal can put a banner on every screen", async () => {
    const { getCurrentPartner } = await import("@/server/partners/auth");
    const partner = await getCurrentPartner();
    expect(partner?.impersonatedBy?.hqAdminEmail).toBe("hq@canvexia.test");
  });

  it("presents as an admin seat — which is exactly why the write gate cannot ask about capabilities first", async () => {
    // HQ sees every screen the partner's own admin sees, because that is the
    // point of looking. The capability check would therefore answer "yes" to
    // everything, and it is the impersonation check that has to come first.
    const { getCurrentPartner } = await import("@/server/partners/auth");
    const partner = await getCurrentPartner();
    expect(partner?.user.role).toBe("admin");
  });

  it("CANNOT WRITE — requireWritablePartner refuses it", async () => {
    const { requireWritablePartner } = await import("@/server/partners/auth");
    expect(await requireWritablePartner()).toBeNull();
    expect(await requireWritablePartner("team.write")).toBeNull();
    expect(await requireWritablePartner("pipeline.write")).toBeNull();
    expect(await requireWritablePartner("revenue.pricing")).toBeNull();
  });
});

describe("an ordinary partner session", () => {
  beforeEach(() => {
    getImpersonation.mockResolvedValue(null);
    authGetUser.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    findUnique.mockResolvedValue({ ...PARTNER, authUserId: "auth-1" });
  });

  it("can still write, so the gate is not simply refusing everything", async () => {
    // The assertion that keeps the one above honest: a gate that returns null
    // for every input would pass those tests and break the portal.
    const { requireWritablePartner } = await import("@/server/partners/auth");
    const who = await requireWritablePartner("team.write");
    expect(who?.partnerId).toBe("p-1");
  });

  it("is still refused a capability its role does not hold", async () => {
    // The legacy path resolves as `admin`, so to test the capability arm we go
    // through `can()` directly on a support seat — the matrix is what decides.
    const { can } = await import("@servd/core");
    expect(can("support", "revenue.pricing")).toBe(false);
  });
});

describe("no partner server action bypasses the write gate", () => {
  /**
   * EVERY `"use server"` file in src/server/partners, not just `*-actions.ts`.
   *
   * The narrower filter is what let this through once already: `demo.ts` holds
   * twelve server actions — create, edit, delete, and a convert that hands back
   * working merchant credentials — and because it is not named `-actions.ts`,
   * the guard written to catch exactly this could not see it. It gated on
   * `status === "approved"` alone, which an HQ read-only impersonation session
   * satisfies and any seat in the partner satisfies.
   *
   * So the list is derived from the file's CONTENTS. A new action file cannot
   * opt out of this by being named something else.
   */
  const DIR = join(process.cwd(), "src/server/partners");

  /**
   * The file with its comments removed.
   *
   * Scanning raw source counts a doc comment that MENTIONS `getCurrentPartner`
   * as a call to it, and counts a comment that mentions `requireWritablePartner`
   * as a gate — so a file could pass by describing the gate it does not have,
   * and a file that correctly explains why it moved OFF `getCurrentPartner`
   * would fail. Both are wrong in the direction that matters.
   */
  const codeOf = (f: string) =>
    readFileSync(join(DIR, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const serverActionFiles = () =>
    readdirSync(DIR)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => codeOf(f).includes('"use server"'));

  /**
   * Files that act for somebody OTHER than a signed-in partner seat, each with
   * the gate that makes that true. Named one by one, and asserted rather than
   * assumed: an exemption nobody re-checks is how the next hole gets in.
   */
  const EXEMPT: Record<string, { why: string; mustContain: string }> = {
    // HQ files that happen to live in this directory.
    "admin.ts": { why: "HQ/owner actions", mustContain: "requireOwnerAction" },
    "operator-actions.ts": { why: "HQ/owner actions", mustContain: "requireOwnerAction" },
    // The public application form: there is no session yet, by definition.
    "apply.ts": { why: "public partner application", mustContain: "applyAsPartner" },
    // The login itself, for the same reason.
    "login-action.ts": { why: "sign in / sign out / reset", mustContain: "signInWithPassword" },
    // Marking an announcement read is a partner-identity write with no
    // capability behind it — every seat may clear its own notice — but it must
    // still refuse an impersonated session, or HQ reading a notice would clear
    // it for the operator who has not.
    "announcements-action.ts": { why: "read receipt, all seats", mustContain: "impersonatedBy" },
  };

  it("sees every server-action file, not just the ones named -actions.ts", () => {
    // The guard on the guard. If this list ever shrinks to the `-actions.ts`
    // files again, the discovery above has quietly broken.
    const files = serverActionFiles();
    expect(files).toContain("demo.ts");
    expect(files).toContain("announcements-action.ts");
    expect(files.length).toBeGreaterThan(8);
  });

  it("every partner server action file goes through requireWritablePartner", () => {
    const offenders: string[] = [];
    for (const f of serverActionFiles()) {
      const src = codeOf(f);
      const exempt = EXEMPT[f];
      if (exempt) {
        expect(src, `${f} is exempt as ${exempt.why} and must keep its own gate`).toContain(
          exempt.mustContain,
        );
        continue;
      }
      if (!src.includes("requireWritablePartner")) offenders.push(f);
    }
    expect(
      offenders,
      `these act for a partner without the write gate: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("no partner action file calls getCurrentPartner directly any more", () => {
    // getCurrentPartner deliberately RESOLVES an impersonated session — that is
    // how the portal renders for HQ. So calling it in an action and acting on
    // the result is precisely the bug.
    const offenders = serverActionFiles()
      .filter((f) => !EXEMPT[f])
      .filter((f) => codeOf(f).includes("getCurrentPartner("));
    expect(offenders).toEqual([]);
  });

  it("every demo action is behind merchants.create", () => {
    // demo.ts is the file the widened guard was written for. Import-level
    // presence is not enough here: `convertPartnerDemo` returns a working
    // merchant login, so assert the capability is actually named.
    const src = codeOf("demo.ts");
    expect(src).toContain('"merchants.create"');
    expect(src).not.toContain('status !== "approved"');
  });
});
