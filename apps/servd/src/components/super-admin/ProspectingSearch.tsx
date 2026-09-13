"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type * as LType from "leaflet";

import { searchProspects, saveProspect, saveAllProspects } from "@/server/prospecting/actions";
import type { ProspectResult } from "@/lib/prospecting/types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/**
 * Super-admin prospecting: type a city, see restaurants on a map + list, and
 * save the ones worth pursuing. Discovery + contact data come from OpenStreetMap
 * (via server actions). Leaflet is dynamically imported so it never runs on SSR.
 */
export function ProspectingSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const layerRef = useRef<LType.LayerGroup | null>(null);
  const LRef = useRef<typeof LType | null>(null);

  // Init the Leaflet map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")) as typeof LType;
      LRef.current = L;
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (cancelled || !mapEl.current || mapRef.current) return;
      const map = L.map(mapEl.current).setView([7.0731, 125.6128], 12); // Davao default
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-plot markers whenever results change.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const pts: [number, number][] = [];
    for (const r of results) {
      if (r.latitude == null || r.longitude == null) continue;
      const icon = L.divIcon({
        html: '<div style="font-size:26px;line-height:1">📍</div>',
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 26],
      });
      const contact = [
        r.address ? escapeHtml(r.address) : null,
        r.phone ? `📞 ${escapeHtml(r.phone)}` : null,
        r.email ? `✉️ ${escapeHtml(r.email)}` : null,
        r.website ? `🌐 <a href="${escapeHtml(r.website)}" target="_blank" rel="noopener">website</a>` : null,
        r.facebook ? `📘 <a href="${escapeHtml(r.facebook)}" target="_blank" rel="noopener">facebook</a>` : null,
      ]
        .filter(Boolean)
        .join("<br/>");
      L.marker([r.latitude, r.longitude], { icon })
        .bindPopup(`<strong>${escapeHtml(r.name)}</strong><br/>${contact || "<em>no contact info</em>"}`)
        .addTo(layer);
      pts.push([r.latitude, r.longitude]);
    }
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
  }, [results]);

  function runSearch() {
    setError(null);
    setNote(null);
    startSearch(async () => {
      const res = await searchProspects(query);
      setResults(res.results);
      setNote(res.note ?? null);
      setError(res.error ?? null);
      setSavedIds(new Set());
    });
  }

  async function save(r: ProspectResult) {
    setSavedIds((prev) => new Set(prev).add(r.sourceId)); // optimistic
    const res = await saveProspect(r);
    if (res.error) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(r.sourceId);
        return next;
      });
      setError(res.error);
      return;
    }
    router.refresh(); // refresh the saved-leads table below
  }

  async function saveAll() {
    setSavingAll(true);
    const res = await saveAllProspects(results);
    setSavingAll(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSavedIds(new Set(results.map((r) => r.sourceId)));
    router.refresh();
  }

  const withContact = results.filter((r) => r.phone || r.email || r.website || r.facebook).length;

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="City or area — e.g. Davao City, Cebu City, Makati"
          className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {searching ? "Searching…" : "Search restaurants"}
        </button>
      </form>

      {error && <p className="text-sm text-guava">{error}</p>}
      {note && <p className="text-sm text-plum-ink/55">{note}</p>}

      <div ref={mapEl} className="h-72 w-full overflow-hidden rounded-tile border border-plum-ink/10" />

      {results.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-plum-ink/55">
            {results.length} venue{results.length === 1 ? "" : "s"} · {withContact} with contact info
          </p>
          <button
            onClick={saveAll}
            disabled={savingAll}
            className="rounded-lg border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary disabled:opacity-60"
          >
            {savingAll ? "Saving…" : "Save all to leads"}
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr className="border-b border-plum-ink/10">
                <th className="px-3 py-2">Restaurant</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Web / FB</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const saved = savedIds.has(r.sourceId);
                return (
                  <tr key={r.sourceId} className="border-t border-plum-ink/5 align-top">
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.name}</span>
                      {r.address && <span className="block text-xs text-plum-ink/45">{r.address}</span>}
                    </td>
                    <td className="px-3 py-2 text-plum-ink/70">
                      {r.phone ?? <span className="text-plum-ink/25">—</span>}
                    </td>
                    <td className="px-3 py-2 text-plum-ink/70">
                      {r.email ?? <span className="text-plum-ink/25">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        {r.website && (
                          <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-primary">
                            web
                          </a>
                        )}
                        {r.facebook && (
                          <a href={r.facebook} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#1877f2]">
                            fb
                          </a>
                        )}
                        {!r.website && !r.facebook && <span className="text-plum-ink/25">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => save(r)}
                        disabled={saved}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          saved
                            ? "bg-mango/15 text-mango"
                            : "border border-plum-ink/15 text-plum-ink/70 hover:bg-plum-ink/5"
                        }`}
                      >
                        {saved ? "Saved ✓" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
