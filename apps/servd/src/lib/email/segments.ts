/**
 * Audience definitions, framework-free so the composer (a client component) can
 * render the picker without pulling in server-only database code.
 *
 * The segments mirror the DIY funnel: someone who built a menu and stopped
 * needs a different message from someone who paid.
 */

export type SegmentKey =
  | "all"
  | "leads"
  | "no_preview"
  | "previewed"
  | "abandoned_payment"
  | "customers";

export const SEGMENTS: { key: SegmentKey; label: string; hint: string }[] = [
  { key: "leads", label: "Warm leads — built, never paid", hint: "The main follow-up list." },
  { key: "no_preview", label: "Started, never saw their preview", hint: "Dropped mid-build." },
  { key: "previewed", label: "Saw their preview, didn't pay", hint: "Closest to converting." },
  { key: "abandoned_payment", label: "Opened payment, didn't finish", hint: "Hottest of all." },
  { key: "customers", label: "Paying customers", hint: "Live accounts." },
  { key: "all", label: "Everyone who gave an email", hint: "Leads and customers together." },
];

export function isSegment(v: unknown): v is SegmentKey {
  return SEGMENTS.some((s) => s.key === v);
}

/** Max recipients per send. Beyond this the founder sends a second campaign. */
export const MAX_RECIPIENTS = 1000;
