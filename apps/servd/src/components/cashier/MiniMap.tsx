"use client";

import { useEffect, useRef } from "react";
import type * as LType from "leaflet";

/** Read-only map showing a pinned location. Leaflet + OSM (no API key). */
export function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")) as typeof LType;
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (cancelled || !el.current || mapRef.current) return;
      const map = L.map(el.current, { zoomControl: true }).setView([lat, lng], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({ html: '<div style="font-size:30px;line-height:1">📍</div>', className: "", iconSize: [30, 30], iconAnchor: [15, 30] });
      L.marker([lat, lng], { icon }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return <div ref={el} className="h-48 w-full overflow-hidden rounded-lg border border-plum-ink/10" />;
}
