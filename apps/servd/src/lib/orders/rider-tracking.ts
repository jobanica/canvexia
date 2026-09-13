/**
 * What the diner may see of the rider, given the booking we hold.
 *
 * A rule, not plumbing: a link is shown only while somebody is actually
 * carrying the order, and only when the provider gave us a page to link to.
 * A manual booking never has one.
 *
 * Lives here rather than beside the query that calls it because that file is
 * "use server" — every export there must be an async Server Action, and this is
 * a pure function that belongs in a test, not on a network boundary.
 */
export interface BookingTrackingFields {
  trackingUrl: string | null;
  riderName: string | null;
  status: string;
}

export interface VisibleRiderTracking {
  riderTrackingUrl: string | null;
  riderName: string | null;
}

export function visibleRiderTracking(
  booking: BookingTrackingFields | null,
): VisibleRiderTracking {
  const live = booking?.status === "assigned" || booking?.status === "picked_up";
  if (!live || !booking?.trackingUrl) return { riderTrackingUrl: null, riderName: null };
  return { riderTrackingUrl: booking.trackingUrl, riderName: booking.riderName ?? null };
}
