import { describe, it, expect } from "vitest";
import {
  canActivatePharmacy,
  type PharmacyForActivation,
} from "@/lib/partners/pharmacy-activation";

function pharmacy(over: Partial<PharmacyForActivation> = {}): PharmacyForActivation {
  return { status: "pending", fdaLtoNumber: "LTO-CDRRHR-2026-0001", ...over };
}

describe("activating a pharmacy", () => {
  it("allows a pending pharmacy with its licence on file", () => {
    expect(canActivatePharmacy(pharmacy())).toEqual({ ok: true });
  });

  it("REFUSES one with no FDA Licence to Operate", () => {
    // The whole reason provisioning creates a pharmacy pending. Without this
    // check, "pending on purpose" is a comment rather than a control.
    const r = canActivatePharmacy(pharmacy({ fdaLtoNumber: null }));
    expect(r).toMatchObject({ ok: false, reason: "no_lto" });
    if (r.ok) return;
    expect(r.message).toMatch(/Settings/);
  });

  it("treats whitespace as no licence", () => {
    expect(canActivatePharmacy(pharmacy({ fdaLtoNumber: "   " }))).toMatchObject({
      ok: false,
      reason: "no_lto",
    });
  });

  it("refuses to re-activate one that is already active", () => {
    expect(canActivatePharmacy(pharmacy({ status: "active" }))).toMatchObject({
      ok: false,
      reason: "already_active",
    });
  });

  it("will not let a partner quietly un-suspend a pharmacy", () => {
    // A suspension is a decision somebody made. Pressing Activate should not
    // erase it without recording a new one.
    const r = canActivatePharmacy(pharmacy({ status: "suspended" }));
    expect(r).toMatchObject({ ok: false, reason: "suspended" });
    if (r.ok) return;
    expect(r.message).toMatch(/CANVEXIA/);
  });

  it("checks the licence even on an unknown status, rather than falling through", () => {
    expect(canActivatePharmacy({ status: "whatever", fdaLtoNumber: null })).toMatchObject({
      ok: false,
      reason: "no_lto",
    });
  });

  it("says why, in every refusal", () => {
    for (const p of [
      pharmacy({ status: "active" }),
      pharmacy({ status: "suspended" }),
      pharmacy({ fdaLtoNumber: null }),
    ]) {
      const r = canActivatePharmacy(p);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.message.length).toBeGreaterThan(20);
    }
  });
});
