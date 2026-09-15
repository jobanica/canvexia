"use client";

import { useEffect, useRef } from "react";
import type * as LType from "leaflet";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  detail: string;
  /** "in" = a check-in, "visit" = a logged visit, "far" = a flagged visit. */
  kind: "in" | "visit" | "far";
}

/**
 * Today's check-ins and visits, on a map.
 *
 * LEAFLET, which is already a dependency of this app — `LocationPicker` and the
 * cashier's `MiniMap` both use it. No new package, no API key, no tile bill.
 *
 * Imported inside an effect rather than at the top of the module: Leaflet
 * touches `window` on import and Next would render this on the server first.
 * That is the same thing `LocationPicker` does, and for the same reason.
 *
 * The map is a SUMMARY, not a surveillance tool. It shows where work was
 * recorded today; it does not show where anybody is now, because nothing in
 * this product knows that.
 */
export function StaffMap({ pins }: { pins: MapPin[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const made = useRef(false);

  useEffect(() => {
    if (!ref.current || made.current || pins.length === 0) return;
    made.current = true;

    let cleanup = () => {};
    void (async () => {
      const L = (await import("leaflet")) as typeof LType;
      // The stylesheet is injected rather than imported, exactly as
      // LocationPicker does it: importing the CSS from the package pulls it
      // into the server bundle, which has no window to attach it to.
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (!ref.current) return;

      const map = L.map(ref.current, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);

      const colour = { in: "#3B1E54", visit: "#16a34a", far: "#dc2626" };
      const group: [number, number][] = [];
      for (const p of pins) {
        L.circleMarker([p.lat, p.lng], {
          radius: 7,
          color: colour[p.kind],
          fillColor: colour[p.kind],
          fillOpacity: 0.75,
          weight: 2,
        })
          .addTo(map)
          .bindPopup(`<strong>${escapeHtml(p.label)}</strong><br/>${escapeHtml(p.detail)}`);
        group.push([p.lat, p.lng]);
      }
      // Fit to everything, with a floor on the zoom so a single pin does not
      // land the viewer on one rooftop with no context.
      map.fitBounds(L.latLngBounds(group).pad(0.25), { maxZoom: 16 });

      cleanup = () => map.remove();
    })();

    return () => cleanup();
  }, [pins]);

  if (pins.length === 0) {
    return (
      <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Today on the map</p>
        <p className="mt-2 text-sm text-brand-ink/50">
          Nothing with a location yet today. Check-ins and visits appear here as they are
          logged — a phone that refused the location permission still records the visit,
          it just has no pin.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <p className="text-sm font-semibold">Today on the map</p>
        <span className="flex flex-wrap gap-3 text-[0.65rem] text-brand-ink/50">
          <Legend colour="#3B1E54" label="Check-in" />
          <Legend colour="#16a34a" label="Visit" />
          <Legend colour="#dc2626" label="Far from the address" />
        </span>
      </div>
      <div ref={ref} className="h-[320px] w-full" />
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
      {label}
    </span>
  );
}

/** Popups take HTML, and a merchant name is user-entered. */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
