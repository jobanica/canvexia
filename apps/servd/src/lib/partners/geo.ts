/**
 * Field-visit geography: how far a visit was logged from where the business
 * actually is.
 *
 * PURE, and written rather than installed. The whole of it is one formula and
 * one threshold, both of which are judgements worth testing at fixed
 * coordinates — "300 m" is a decision about how accurate a phone GPS is in a
 * Philippine market street, not a measurement.
 */

/** Metres. Beyond this, a visit is flagged for a manager to look at. */
export const VISIT_RADIUS_METERS = 300;

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export interface Point {
  lat: number;
  lng: number;
}

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than the equirectangular approximation: the approximation is
 * faster and is fine over 300 m, but this same function is what a manager's map
 * uses to sort a day's visits, and those span a city.
 */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export type VisitFlag = "ok" | "far" | "no_address" | "no_location";

export interface VisitCheck {
  /** Null when either end is unknown — NOT zero. */
  distanceMeters: number | null;
  flag: VisitFlag;
  /** What the screen says. One sentence, no jargon. */
  note: string;
}

/**
 * Compare where the visit was logged against where the business is.
 *
 * FOUR OUTCOMES, NOT TWO, and the distinction between the middle two is the
 * point. "We have no address for this business" and "they logged it 2 km away"
 * are different facts and only the second is anybody's fault. Collapsing them
 * into one flag — which a boolean would — turns a data-entry gap into an
 * accusation, and the person it accuses cannot fix it.
 *
 * `accuracy` widens the allowance rather than being ignored: a phone that
 * reports ±400 m indoors is not evidence of anything, and flagging it would
 * teach a manager that the flag means nothing.
 */
export function checkVisit(
  logged: Point | null,
  subject: Point | null,
  accuracy: number | null = null,
): VisitCheck {
  if (!logged) {
    return {
      distanceMeters: null,
      flag: "no_location",
      note: "No location captured — the phone refused or was offline.",
    };
  }
  if (!subject) {
    return {
      distanceMeters: null,
      flag: "no_address",
      note: "No address on file for this business, so there is nothing to compare against.",
    };
  }

  const d = distanceMeters(logged, subject);
  const allowance = VISIT_RADIUS_METERS + Math.max(0, accuracy ?? 0);
  if (d <= allowance) {
    return { distanceMeters: d, flag: "ok", note: `${Math.round(d)} m from the address on file.` };
  }
  return {
    distanceMeters: d,
    flag: "far",
    note: `${formatDistance(d)} from the address on file.`,
  };
}

/** "180 m" under a kilometre, "2.4 km" over it. */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Is a set of coordinates usable at all?
 *
 * (0, 0) is in the Gulf of Guinea and is what a broken geolocation call returns
 * often enough to be worth naming. Nothing in the Philippines is within a
 * thousand kilometres of it.
 */
export function isUsable(p: Point | null | undefined): p is Point {
  if (!p) return false;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return false;
  return !(p.lat === 0 && p.lng === 0);
}
