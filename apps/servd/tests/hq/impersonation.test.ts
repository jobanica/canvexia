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
  it("every *-actions.ts that acts for a partner imports requireWritablePartner", () => {
    // A SOURCE-LEVEL DRIFT GUARD, and the real failure mode it catches: someone
    // adds an eighth action file next month, reaches for `getCurrentPartner`
    // because that is what the others used to do, and quietly opens a write
    // path that an HQ read-only session can reach.
    //
    // operator-actions.ts is excluded by name: it is an HQ action file that
    // happens to live in this directory, and it is gated by
    // requireOwnerAction — asserted below rather than assumed.
    const dir = join(process.cwd(), "src/server/partners");
    const files = readdirSync(dir).filter((f) => f.endsWith("-actions.ts"));
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      if (f === "operator-actions.ts") {
        expect(src, "operator-actions.ts is an HQ file and must stay owner-gated").toContain(
          "requireOwnerAction",
        );
        continue;
      }
      if (!src.includes("requireWritablePartner")) offenders.push(f);
    }
    expect(offenders, `these act for a partner without the write gate: ${offenders.join(", ")}`).toEqual([]);
  });

  it("no partner action file calls getCurrentPartner directly any more", () => {
    // getCurrentPartner deliberately RESOLVES an impersonated session — that is
    // how the portal renders for HQ. So calling it in an action and acting on
    // the result is precisely the bug.
    const dir = join(process.cwd(), "src/server/partners");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith("-actions.ts"))
      .filter((f) => readFileSync(join(dir, f), "utf8").includes("getCurrentPartner("));
    expect(offenders).toEqual([]);
  });
});
