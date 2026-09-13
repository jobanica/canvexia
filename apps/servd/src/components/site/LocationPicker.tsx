"use client";

import { useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";

// In-app browsers (Messenger, Facebook, Instagram, etc.) usually BLOCK the
// Geolocation prompt, so "use my current location" silently fails there. Detect
// them so we can nudge the customer to open the page in a real browser, where
// location works. Returns the platform so we can hand off correctly.
type InAppEnv = "android" | "ios" | "other";
function detectInAppBrowser(): InAppEnv | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const inApp = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|Twitter|GSA\/|; wv\)|WebView/i.test(ua);
  if (!inApp) return null;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "other";
}

/**
 * Lets a delivery customer pin their exact location. Uses Leaflet +
 * OpenStreetMap tiles (no API key) and the browser Geolocation API. Leaflet is
 * dynamically imported so it never runs during SSR (it touches `window`).
 */
export function LocationPicker({
  onChange,
  initial,
  defaultCenter,
  enableSearch = false,
}: {
  onChange: (lat: number, lng: number) => void;
  // Pre-selects a pin (admin store-location picker).
  initial?: { lat: number; lng: number } | null;
  // Centers the map here without committing a pin (e.g. the store location, so
  // diners near the store don't start on a far-away default view).
  defaultCenter?: { lat: number; lng: number } | null;
  // Shows an address search box that recenters the map (admin store picker).
  enableSearch?: boolean;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const markerRef = useRef<LType.Marker | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  // Detected after mount (client-only) to avoid an SSR/hydration mismatch.
  const [inApp, setInApp] = useState<InAppEnv | null>(null);
  useEffect(() => setInApp(detectInAppBrowser()), []);

  // Android in-app browsers can hand off to Chrome via an intent URL, which
  // reloads this exact page in Chrome where location works. iOS webviews can't
  // be forced open, so there we show manual "open in browser" steps instead.
  function openInChrome() {
    const noScheme = window.location.href.replace(/^https?:\/\//, "");
    window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  // Ask the browser for the device's GPS/network location and drop the pin
  // there, so the customer doesn't have to hunt for their spot on the map.
  // Triggers the native "use your location" permission prompt on first use.
  function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError("This device can't share its location. Tap the map instead.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        mapRef.current?.setView([lat, lng], 17);
        markerRef.current?.setLatLng([lat, lng]);
        setCoords({ lat, lng });
        onChange(lat, lng);
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was blocked. Allow it in your browser, or tap the map to pin your spot."
            : "Couldn't get your location. Please tap the map to pin your spot.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  // Geocode the typed address (free OpenStreetMap Nominatim, no API key) and
  // recenter the map + marker on the first match, committing it as the pin.
  async function runSearch() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { "Accept-Language": "en" } },
      );
      const data = (await res.json()) as { lat: string; lon: string }[];
      if (!Array.isArray(data) || data.length === 0) {
        setSearchError("No match found. Try a more specific address.");
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setSearchError("No match found. Try a more specific address.");
        return;
      }
      mapRef.current?.setView([lat, lng], 16);
      markerRef.current?.setLatLng([lat, lng]);
      setCoords({ lat, lng });
      onChange(lat, lng);
    } catch {
      setSearchError("Couldn't search right now. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")) as typeof LType;
      LRef.current = L;
      // Inject Leaflet CSS (CDN) once.
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (cancelled || !mapEl.current || mapRef.current) return;

      // Center priority: a pre-set pin → the store location → Davao fallback.
      const start = initial ?? defaultCenter ?? { lat: 7.0731, lng: 125.6128 };
      const zoom = initial ? 16 : defaultCenter ? 15 : 12;
      const map = L.map(mapEl.current).setView([start.lat, start.lng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({ html: '<div style="font-size:30px;line-height:1">📍</div>', className: "", iconSize: [30, 30], iconAnchor: [15, 30] });
      const marker = L.marker([start.lat, start.lng], { draggable: true, icon }).addTo(map);
      function set(lat: number, lng: number) {
        setCoords({ lat, lng });
        onChange(lat, lng);
      }
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        set(p.lat, p.lng);
      });
      map.on("click", (e: LType.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        set(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
      markerRef.current = marker;
      // Fix sizing inside flex/sheet layouts.
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {enableSearch && (
        <div className="mb-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter searches without submitting the surrounding form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Search an address or place…"
              className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="shrink-0 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {searching ? "…" : "Search"}
            </button>
          </div>
          {searchError && <p className="mt-1 text-xs text-guava">{searchError}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={locateMe}
        disabled={locating}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary disabled:opacity-50"
      >
        {locating ? "Finding you…" : "📍 Use my current location"}
      </button>
      {locateError && <p className="mb-2 text-xs text-guava">{locateError}</p>}
      {/* Messenger/Facebook/IG in-app browsers block location — help the
          customer reopen the page in a real browser where it works. */}
      {inApp && (
        <div className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-plum-ink/70">
          <p className="font-semibold text-plum-ink/80">📱 Opened from Messenger/Facebook?</p>
          {inApp === "android" ? (
            <p className="mt-0.5">
              Location is blocked in the in-app browser.{" "}
              <button type="button" onClick={openInChrome} className="font-semibold text-brand-primary underline">
                Open in Chrome
              </button>{" "}
              to use it — or just tap the map to pin your spot.
            </p>
          ) : (
            <p className="mt-0.5">
              Location is blocked here. Tap the <strong>⋯</strong> menu and choose{" "}
              <strong>“Open in browser”</strong> (Safari) to use it — or just tap the map to pin your spot.
            </p>
          )}
        </div>
      )}
      <div ref={mapEl} className="h-44 w-full overflow-hidden rounded-lg border border-plum-ink/10" />
      <p className="mt-1 text-xs text-plum-ink/50">
        {coords ? `Pinned: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "Use your location above, or tap the map / drag the 📍 to your exact spot."}
      </p>
    </div>
  );
}
