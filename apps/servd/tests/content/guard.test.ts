import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The Content Engine API must deny non-super-admins exactly like the rest of the
 * admin area. We mock the auth helper to simulate "not a super-admin" and assert
 * the route returns 401 without doing any work.
 */

// requireSuperAdmin throws "UNAUTHORIZED" for non-super users; the route catches
// it and returns 401. Mock it to reject.
const requireSuperAdmin = vi.fn();
vi.mock("@/server/tenancy/current-user", () => ({
  requireSuperAdmin: () => requireSuperAdmin(),
}));

// Guard rails: if auth fails, none of these should be reached. Mock them so the
// test can also assert they were NOT called.
const getOrCreateBrand = vi.fn();
const generateScript = vi.fn();
vi.mock("@/server/content/brand", () => ({ getOrCreateBrand: () => getOrCreateBrand() }));
vi.mock("@/server/content/claude", () => ({
  generateScript: () => generateScript(),
  contentEngineEnabled: () => true,
}));
vi.mock("@/server/tenancy/scoped-db", () => ({ systemDb: vi.fn() }));

import { POST } from "@/app/(platform)/super-admin/content-engine/api/generate/route";

function req(body: unknown) {
  return new Request("http://localhost/super-admin/content-engine/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("content-engine generate route — auth gate", () => {
  beforeEach(() => {
    requireSuperAdmin.mockReset();
    getOrCreateBrand.mockReset();
    generateScript.mockReset();
  });

  it("returns 401 for a non-super-admin and does no work", async () => {
    requireSuperAdmin.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await POST(req({ type: "JAB", platform: "reels", lengthSec: 30 }));

    expect(res.status).toBe(401);
    expect(getOrCreateBrand).not.toHaveBeenCalled();
    expect(generateScript).not.toHaveBeenCalled();
  });

  it("passes the auth gate for a super-admin (then validates input)", async () => {
    requireSuperAdmin.mockResolvedValue({ kind: "super" });

    // Invalid body → 400, proving we got PAST the auth gate (not 401).
    const res = await POST(req({ type: "NOPE", platform: "reels", lengthSec: 30 }));

    expect(res.status).toBe(400);
  });
});
