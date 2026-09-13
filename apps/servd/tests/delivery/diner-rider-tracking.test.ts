import { describe, expect, it } from "vitest";
import { visibleRiderTracking } from "@/lib/orders/rider-tracking";

/**
 * The diner sees a track-your-rider link only when there is genuinely something
 * to look at. Two ways that fails, and both are ordinary rather than broken:
 * the provider gave us no page (manual, deep-link), or the delivery is over.
 */
describe("what the diner may see of the rider", () => {
  const url = "https://ref.supabase.co/functions/v1/track?t=tok123";

  it("shows the link while a rider is carrying it", () => {
    expect(visibleRiderTracking({ trackingUrl: url, riderName: "Ben Cruz", status: "picked_up" }))
      .toEqual({ riderTrackingUrl: url, riderName: "Ben Cruz" });
  });

  it("shows it as soon as a rider is assigned", () => {
    expect(visibleRiderTracking({ trackingUrl: url, riderName: null, status: "assigned" }).riderTrackingUrl)
      .toBe(url);
  });

  it("shows nothing for a manual booking — there is no page to open", () => {
    expect(visibleRiderTracking({ trackingUrl: null, riderName: null, status: "manual" }))
      .toEqual({ riderTrackingUrl: null, riderName: null });
  });

  it("shows nothing while a rider is still being found", () => {
    expect(visibleRiderTracking({ trackingUrl: url, riderName: null, status: "searching" }).riderTrackingUrl)
      .toBeNull();
  });

  it("stops once the delivery is over", () => {
    for (const status of ["delivered", "cancelled", "failed"]) {
      expect(visibleRiderTracking({ trackingUrl: url, riderName: "Ben", status }).riderTrackingUrl,
        `status ${status}`).toBeNull();
    }
  });

  it("shows nothing when there is no booking at all", () => {
    expect(visibleRiderTracking(null)).toEqual({ riderTrackingUrl: null, riderName: null });
  });

  it("does not name a rider it cannot link to", () => {
    // Name without a URL would render "Track Ben Cruz" with nowhere to go.
    expect(visibleRiderTracking({ trackingUrl: null, riderName: "Ben Cruz", status: "picked_up" }).riderName)
      .toBeNull();
  });
});
