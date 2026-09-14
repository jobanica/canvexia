import { describe, it, expect } from "vitest";
import {
  can,
  permissionsOf,
  authoriseSale,
  isPharmacyRole,
  PERMISSIONS,
  PHARMACY_ROLES,
  ROLE_LABEL,
  type PharmacyRole,
} from "@/lib/pharmacy/roles";

describe("who may do what", () => {
  it("gives the owner every permission, including ones added later", () => {
    // Asserted over the PERMISSIONS list rather than a copy of it, so a
    // permission added next year is covered by this test the moment it exists.
    for (const p of PERMISSIONS) {
      expect(can("owner", p)).toBe(true);
    }
    expect(permissionsOf("owner")).toEqual([...PERMISSIONS]);
  });

  it("lets a cashier sell and nothing else", () => {
    expect(permissionsOf("cashier")).toEqual(["sell"]);
  });

  it("keeps every role a subset of the owner's", () => {
    for (const role of PHARMACY_ROLES) {
      for (const p of permissionsOf(role)) {
        expect(can("owner", p)).toBe(true);
      }
    }
  });

  it("labels every role", () => {
    for (const role of PHARMACY_ROLES) {
      expect(ROLE_LABEL[role]).toBeTruthy();
    }
  });

  it("recognises only real roles", () => {
    expect(isPharmacyRole("pharmacist")).toBe(true);
    expect(isPharmacyRole("admin")).toBe(false);
    expect(isPharmacyRole("")).toBe(false);
  });
});

describe("the prescription gate", () => {
  /**
   * The one permission here that is law rather than policy: under PH practice
   * an Rx medicine is dispensed by, or under the direct supervision of, a
   * registered pharmacist.
   */
  it("belongs to the pharmacist and the owner, and to nobody else", () => {
    const holders = PHARMACY_ROLES.filter((r) => can(r, "dispenseRx"));
    expect(holders.sort()).toEqual(["owner", "pharmacist"]);
  });

  it("does not come with the manager role, senior though it is", () => {
    expect(can("manager", "manageStaff")).toBe(true);
    expect(can("manager", "dispenseRx")).toBe(false);
  });
});

describe("authorising a specific cart", () => {
  const otc = [{ requiresPrescription: false }];
  const rx = [{ requiresPrescription: false }, { requiresPrescription: true }];

  it("lets a cashier sell an over-the-counter cart", () => {
    expect(authoriseSale("cashier", otc)).toEqual({ ok: true });
  });

  it("stops a cashier completing a cart with ONE Rx item in it", () => {
    const result = authoriseSale("cashier", rx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("needs_pharmacist");
    // The message has to say what to do about it. A cashier who cannot dispense
    // needs a pharmacist, not an error.
    expect(result.message).toMatch(/pharmacist/i);
  });

  it("stops a manager too — seniority is not a licence", () => {
    expect(authoriseSale("manager", rx)).toMatchObject({
      ok: false,
      reason: "needs_pharmacist",
    });
  });

  it("lets a pharmacist and an owner complete it", () => {
    expect(authoriseSale("pharmacist", rx)).toEqual({ ok: true });
    expect(authoriseSale("owner", rx)).toEqual({ ok: true });
  });

  it("allows an empty cart through — emptiness is the sale path's problem", () => {
    expect(authoriseSale("cashier", [])).toEqual({ ok: true });
  });

  it("refuses a role that cannot sell at all, before looking at the cart", () => {
    // No role today lacks `sell`, so this is asserted through the primitive the
    // function actually uses. It is the arm that matters if a read-only role is
    // ever added.
    const readOnly = "auditor" as unknown as PharmacyRole;
    const result = authoriseSale(readOnly, otc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cannot_sell");
  });
});
