import { describe, it, expect } from "vitest";
import {
  VISIT_RADIUS_METERS,
  checkVisit,
  distanceMeters,
  formatDistance,
  isUsable,
} from "@/lib/partners/geo";

/**
 * The 300 m rule, at fixed coordinates.
 *
 * "300 m" is a judgement about how accurate a phone GPS is on a Philippine
 * market street, not a measurement, which is exactly why it is worth pinning:
 * somebody will want to tighten it, and the tests say what that would start
 * flagging.
 */

// Two real points in Davao, about 1.1 km apart.
const SM_LANANG = { lat: 7.0985, lng: 125.6295 };
const ABREEZA = { lat: 7.0903, lng: 125.6132 };

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters(SM_LANANG, SM_LANANG)).toBe(0);
  });

  it("is symmetric", () => {
    expect(distanceMeters(SM_LANANG, ABREEZA)).toBeCloseTo(
      distanceMeters(ABREEZA, SM_LANANG),
      6,
    );
  });

  it("measures a known Davao distance to within a few percent", () => {
    const d = distanceMeters(SM_LANANG, ABREEZA);
    expect(d).toBeGreaterThan(1800);
    expect(d).toBeLessThan(2200);
  });

  it("handles a tiny offset without losing precision", () => {
    // ~111 m of latitude. The equirectangular shortcut is fine here; haversine
    // is used because the same function sorts a manager's map across a city.
    const d = distanceMeters(SM_LANANG, { ...SM_LANANG, lat: SM_LANANG.lat + 0.001 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(120);
  });
});

describe("checkVisit", () => {
  it("passes a visit logged at the door", () => {
    const r = checkVisit(SM_LANANG, SM_LANANG);
    expect(r.flag).toBe("ok");
    expect(r.distanceMeters).toBe(0);
  });

  it("passes a visit just inside the radius", () => {
    // ~200 m north.
    const near = { ...SM_LANANG, lat: SM_LANANG.lat + 0.0018 };
    const r = checkVisit(near, SM_LANANG);
    expect(r.flag).toBe("ok");
    expect(r.distanceMeters!).toBeLessThan(VISIT_RADIUS_METERS);
  });

  it("flags a visit logged from the other mall", () => {
    const r = checkVisit(ABREEZA, SM_LANANG);
    expect(r.flag).toBe("far");
    expect(r.note).toContain("km");
  });

  it("does NOT flag a far reading when the phone admits it is imprecise", () => {
    // A phone reporting ±2 km indoors is not evidence of anything, and flagging
    // it would teach a manager that the flag means nothing.
    const r = checkVisit(ABREEZA, SM_LANANG, 2000);
    expect(r.flag).toBe("ok");
  });

  it("separates 'no address on file' from 'logged it far away'", () => {
    // THE DISTINCTION THAT MATTERS. Only one of these is anybody's fault, and
    // the person it would accuse cannot fix the other one.
    const noAddress = checkVisit(SM_LANANG, null);
    expect(noAddress.flag).toBe("no_address");
    expect(noAddress.distanceMeters).toBeNull();
    expect(noAddress.note).toContain("No address on file");

    const far = checkVisit(ABREEZA, SM_LANANG);
    expect(far.flag).toBe("far");
    expect(far.distanceMeters).not.toBeNull();
  });

  it("reports a missing location as its own thing, not as zero distance", () => {
    const r = checkVisit(null, SM_LANANG);
    expect(r.flag).toBe("no_location");
    // Zero would read as "logged at the door", which is the opposite of true.
    expect(r.distanceMeters).toBeNull();
  });
});

describe("isUsable", () => {
  it("rejects Null Island", () => {
    // (0, 0) is in the Gulf of Guinea and is what a broken geolocation call
    // returns often enough to be worth naming. Nothing in the Philippines is
    // within a thousand kilometres of it.
    expect(isUsable({ lat: 0, lng: 0 })).toBe(false);
  });

  it("rejects out-of-range and non-finite values", () => {
    expect(isUsable({ lat: 91, lng: 0 })).toBe(false);
    expect(isUsable({ lat: 0, lng: 181 })).toBe(false);
    expect(isUsable({ lat: NaN, lng: 125 })).toBe(false);
    expect(isUsable(null)).toBe(false);
    expect(isUsable(undefined)).toBe(false);
  });

  it("accepts a real Philippine coordinate", () => {
    expect(isUsable(SM_LANANG)).toBe(true);
  });
});

describe("formatDistance", () => {
  it("uses metres under a kilometre and kilometres over", () => {
    expect(formatDistance(180)).toBe("180 m");
    expect(formatDistance(999)).toBe("999 m");
    expect(formatDistance(1000)).toBe("1.0 km");
    expect(formatDistance(2432)).toBe("2.4 km");
  });
});
