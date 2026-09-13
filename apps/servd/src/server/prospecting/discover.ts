import "server-only";

import type { ProspectResult } from "@/lib/prospecting/types";

/**
 * Restaurant discovery via OpenStreetMap — no API key, no Google ToS issues.
 *
 *   1. Geocode the city/area to a bounding box with Nominatim.
 *   2. Query the Overpass API for food venues in that box.
 *   3. Map OSM tags → name / address / phone / website / email / facebook.
 *
 * OSM is community data: phone & website are common, email & facebook less so —
 * those gaps are filled on demand by scraping each venue's own site (enrich.ts).
 */

// Nominatim asks every caller to identify itself with a descriptive UA.
const UA = "ServdProspecting/1.0 (+https://servdph.com; restaurant SaaS lead tool)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = "https://overpass-api.de/api/interpreter";

// Food-service amenities worth pursuing as Servd customers.
const AMENITIES = "restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|bakery";
const MAX_RESULTS = 120;

interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface OverpassEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface DiscoverResponse {
  results: ProspectResult[];
  note?: string;
  error?: string;
}

/** Resolve a free-text place ("Davao City", "Makati") to a bounding box. */
async function geocode(query: string): Promise<BBox | null> {
  const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ boundingbox?: [string, string, string, string] }>;
  const box = data[0]?.boundingbox;
  if (!box) return null;
  // Nominatim order: [minLat, maxLat, minLon, maxLon].
  const [south, north, west, east] = box.map(Number) as [number, number, number, number];
  if ([south, north, west, east].some((n) => Number.isNaN(n))) return null;
  return { south, west, north, east };
}

function buildQuery(b: BBox): string {
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:25];(nwr["amenity"~"^(${AMENITIES})$"](${bbox}););out center ${MAX_RESULTS};`;
}

function normalizeUrl(raw?: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function normalizeFacebook(raw?: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/facebook\.com/i.test(v)) return `https://${v.replace(/^\/+/, "")}`;
  return `https://facebook.com/${v.replace(/^\/+/, "")}`;
}

function composeAddress(t: Record<string, string>): string | null {
  if (t["addr:full"]) return t["addr:full"];
  const line = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const parts = [line, t["addr:city"] || t["addr:suburb"], t["addr:province"] || t["addr:state"]]
    .map((p) => (p || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Leads with more contact info bubble to the top of the list. */
function contactScore(r: ProspectResult): number {
  return (r.phone ? 1 : 0) + (r.website ? 1 : 0) + (r.email ? 2 : 0) + (r.facebook ? 1 : 0);
}

export async function discoverRestaurants(query: string): Promise<DiscoverResponse> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { results: [], error: "Enter a city or area to search." };

  let bbox: BBox | null;
  try {
    bbox = await geocode(trimmed);
  } catch {
    return { results: [], error: "Couldn't reach the geocoder. Try again in a moment." };
  }
  if (!bbox) {
    return { results: [], error: `Couldn't find “${trimmed}”. Try a more specific place name.` };
  }

  let elements: OverpassEl[];
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(buildQuery(bbox)),
    });
    if (!res.ok) {
      return { results: [], error: `Map data service is busy (HTTP ${res.status}). Try again shortly.` };
    }
    const json = (await res.json()) as { elements?: OverpassEl[] };
    elements = json.elements ?? [];
  } catch {
    return { results: [], error: "Couldn't reach the map data service. Try again." };
  }

  const seen = new Set<string>();
  const results: ProspectResult[] = [];
  for (const el of elements) {
    const t = el.tags;
    if (!t?.name) continue;
    const sourceId = `${el.type}/${el.id}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    results.push({
      source: "osm",
      sourceId,
      name: t.name,
      address: composeAddress(t),
      latitude: el.lat ?? el.center?.lat ?? null,
      longitude: el.lon ?? el.center?.lon ?? null,
      phone: t.phone || t["contact:phone"] || t["phone:mobile"] || null,
      website: normalizeUrl(t.website || t["contact:website"] || t.url),
      email: (t.email || t["contact:email"] || "").trim().toLowerCase() || null,
      facebook: normalizeFacebook(t["contact:facebook"] || t.facebook),
    });
  }

  results.sort((a, b) => contactScore(b) - contactScore(a) || a.name.localeCompare(b.name));

  const note =
    results.length >= MAX_RESULTS
      ? `Showing the first ${MAX_RESULTS} venues — search a more specific area for the rest.`
      : results.length === 0
        ? "No restaurants found in that area on OpenStreetMap. Try a nearby city or a broader term."
        : undefined;

  return { results, note };
}
