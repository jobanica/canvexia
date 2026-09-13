/** Sales-prospecting shared types (safe to import on the client). */

export type ProspectStatus =
  | "new"
  | "contacted"
  | "interested"
  | "converted"
  | "rejected";

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "new",
  "contacted",
  "interested",
  "converted",
  "rejected",
];

/** A restaurant discovered from OpenStreetMap (not yet saved). */
export interface ProspectResult {
  source: string; // "osm"
  sourceId: string; // e.g. "node/123" — stable per place
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  facebook: string | null;
}
