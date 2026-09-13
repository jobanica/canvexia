import "server-only";

/**
 * Best-effort contact enrichment: fetch a venue's OWN public website and pull
 * the first email + Facebook page off it. Polite — short timeout, capped body,
 * single request, identifies itself. Returns nulls on any failure (never throws).
 */

const UA = "ServdProspecting/1.0 (+https://servdph.com)";
const TIMEOUT_MS = 8000;
const MAX_BYTES = 800_000;

function extractEmail(html: string): string | null {
  // Prefer an explicit mailto: — that's almost always a real contact address.
  const mailto = html.match(/mailto:([^"'?>\s]+@[^"'?>\s]+)/i);
  const candidate = mailto
    ? decodeURIComponent(mailto[1])
    : html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  if (!candidate) return null;
  const email = candidate.trim().toLowerCase();
  // Drop asset filenames and well-known non-addresses.
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)) return null;
  if (/(sentry|wixpress|example\.(com|org)|your-?email|domain\.com|email@)/i.test(email)) return null;
  return email;
}

function extractFacebook(html: string): string | null {
  const re = /https?:\/\/(?:www\.|web\.|m\.|business\.)?facebook\.com\/[A-Za-z0-9_.\-/]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[0].replace(/[")'.,]+$/, "");
    // Skip share widgets, tracking pixels, login & generic endpoints.
    if (/facebook\.com\/(sharer|share|dialog|plugins|tr|login|events|hashtag|profile\.php)\b/i.test(url)) {
      continue;
    }
    return url;
  }
  return null;
}

export async function scrapeContacts(
  website: string,
): Promise<{ email: string | null; facebook: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(website, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return { email: null, facebook: null };
    const html = (await res.text()).slice(0, MAX_BYTES);
    return { email: extractEmail(html), facebook: extractFacebook(html) };
  } catch {
    return { email: null, facebook: null };
  } finally {
    clearTimeout(timer);
  }
}
