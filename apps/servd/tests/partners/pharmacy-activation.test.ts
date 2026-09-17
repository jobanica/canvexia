import { describe, it, expect } from "vitest";
import {
  canActivatePharmacy,
  hasLto,
  NO_LTO_WARNING,
  type PharmacyForActivation,
} from "@/lib/partners/pharmacy-activation";

function pharmacy(over: Partial<PharmacyForActivation> = {}): PharmacyForActivation {
  return { status: "pending", fdaLtoNumber: "LTO-CDRRHR-2026-0001", ...over };
}

/**
 * THE LICENCE IS A WARNING NOW, NOT A DOOR.
 *
 * This file used to assert the opposite, and the change is a correction rather
 * than a loosening. The gate refused activation until an FDA Licence to Operate
 * number was recorded, on the argument that a pharmacy cannot legally dispense
 * without one. The argument is true; the gate did not serve it. It is a text
 * box — nothing here verifies a number with the FDA and nothing can — so a
 * licensed pharmacy whose number had not been typed in yet was blocked, while
 * anything at all typed into the field satisfied it. It bought the APPEARANCE
 * of a control at the price of a real one, and the only people it stopped were
 * the ones doing it properly.
 *
 * What replaces it is a record: the audit row states whether the licence was on
 * file at the time, and the account keeps saying so until somebody fixes it.
 */
describe("activating a pharmacy", () => {
  it("allows a pending pharmacy with its licence on file, with nothing to chase", () => {
    expect(canActivatePharmacy(pharmacy())).toEqual({ ok: true });
  });

  it("ALLOWS one with no licence, and says what to chase", () => {
    const r = canActivatePharmacy(pharmacy({ fdaLtoNumber: null }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warning).toBe(NO_LTO_WARNING);
    // Actionable: it names where the pharmacy records it.
    expect(r.warning).toMatch(/Settings/);
  });

  it("treats whitespace as no licence", () => {
    const r = canActivatePharmacy(pharmacy({ fdaLtoNumber: "   " }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warning).toBeTruthy();
    expect(hasLto("   ")).toBe(false);
  });

  it("refuses to re-activate one that is already active", () => {
    expect(canActivatePharmacy(pharmacy({ status: "active" }))).toMatchObject({
      ok: false,
      reason: "already_active",
    });
  });

  it("will not let a partner quietly un-suspend a pharmacy", () => {
    // A suspension is a decision somebody made. Pressing Activate should not
    // erase it without recording a new one. This one stayed a refusal, because
    // it is about state rather than paperwork.
    const r = canActivatePharmacy(pharmacy({ status: "suspended" }));
    expect(r).toMatchObject({ ok: false, reason: "suspended" });
    if (r.ok) return;
    expect(r.message).toMatch(/CANVEXIA/);
  });

  it("does not fall through on an unknown status", () => {
    // Anything that is not active or suspended is activatable, licence or not.
    const r = canActivatePharmacy({ status: "whatever", fdaLtoNumber: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warning).toBeTruthy();
  });

  it("says why, in every refusal", () => {
    for (const p of [pharmacy({ status: "active" }), pharmacy({ status: "suspended" })]) {
      const r = canActivatePharmacy(p);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.message.length).toBeGreaterThan(20);
    }
  });

  it("leaves only the two state refusals", () => {
    // If a third reason appears, it should be a decision somebody makes on
    // purpose rather than one that creeps back in.
    const reasons = new Set<string>();
    for (const status of ["pending", "active", "suspended", "whatever"]) {
      for (const lto of [null, "  ", "LTO-1"]) {
        const r = canActivatePharmacy({ status, fdaLtoNumber: lto });
        if (!r.ok) reasons.add(r.reason);
      }
    }
    expect([...reasons].sort()).toEqual(["already_active", "suspended"]);
  });
});
