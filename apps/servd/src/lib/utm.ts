/**
 * Ad attribution, from the click to the paying restaurant.
 *
 * The question this answers is "which Facebook creative produces ACTIVATIONS",
 * not "which one gets clicks" — a cheap click that never becomes a restaurant
 * is a cost, not a result. So the tags are captured at the landing page and
 * carried all the way onto the lead row, where they sit next to the activation.
 *
 * Pure and dependency-free: this runs in Edge middleware, so it can't touch the
 * database, Node APIs, or anything framework-shaped.
 */

export interface Utm {
  source: string;
  medium: string;
  campaign: string;
  content: string;
}

export const UTM_COOKIE = "servd_utm";
/** Long enough to cover the whole consideration window — people take weeks. */
export const UTM_MAX_AGE = 90 * 24 * 60 * 60;

export const EMPTY_UTM: Utm = { source: "", medium: "", campaign: "", content: "" };

/** Cap and strip so a hand-typed URL can't write junk into the cookie or DB. */
function clean(v: string | null): string {
  if (!v) return "";
  // Control characters out (they would break a Set-Cookie header), then a cap.
  return v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
}

/**
 * The tags on an incoming URL, or null when there are none — which is what
 * makes the capture non-destructive: a plain reload of /create carries no
 * params and must not wipe the attribution from the ad click that got them here.
 */
export function readUtmParams(params: URLSearchParams): Utm | null {
  const utm: Utm = {
    source: clean(params.get("utm_source")),
    medium: clean(params.get("utm_medium")),
    campaign: clean(params.get("utm_campaign")),
    content: clean(params.get("utm_content")),
  };
  if (utm.source || utm.medium || utm.campaign || utm.content) return utm;

  // An untagged Facebook link still tells us where it came from. We record only
  // that much — calling it "paid" would make an organic share look like ad
  // spend, and a wrong number is worse than a missing one.
  if (params.get("fbclid")) return { ...EMPTY_UTM, source: "facebook" };
  return null;
}

export function encodeUtm(u: Utm): string {
  const p = new URLSearchParams();
  if (u.source) p.set("s", u.source);
  if (u.medium) p.set("m", u.medium);
  if (u.campaign) p.set("c", u.campaign);
  if (u.content) p.set("x", u.content);
  return p.toString();
}

export function decodeUtm(raw: string | null | undefined): Utm {
  if (!raw) return { ...EMPTY_UTM };
  try {
    const p = new URLSearchParams(raw);
    return {
      source: clean(p.get("s")),
      medium: clean(p.get("m")),
      campaign: clean(p.get("c")),
      content: clean(p.get("x")),
    };
  } catch {
    return { ...EMPTY_UTM };
  }
}

export function hasUtm(u: Utm): boolean {
  return !!(u.source || u.medium || u.campaign || u.content);
}

/**
 * The tags as a query string to hang off a CTA link.
 *
 * Belt and braces alongside the cookie: some in-app browsers partition or drop
 * cookies, and losing attribution costs the founder the one number that decides
 * where the ad budget goes.
 */
export function utmQuery(u: Utm): string {
  const p = new URLSearchParams();
  if (u.source) p.set("utm_source", u.source);
  if (u.medium) p.set("utm_medium", u.medium);
  if (u.campaign) p.set("utm_campaign", u.campaign);
  if (u.content) p.set("utm_content", u.content);
  return p.toString();
}

/** A CTA href with the current attribution carried through. */
export function withUtm(path: string, u: Utm): string {
  const q = utmQuery(u);
  if (!q) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${q}`;
}

/** How a row is labelled in the funnel table. */
export function utmLabel(u: Utm): string {
  const parts = [u.source, u.medium, u.campaign, u.content].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Direct / untagged";
}
