import "server-only";

/**
 * Best-effort extraction of a business's public details from its Facebook page.
 *
 * Facebook shows browsers a login wall, but it serves real Open Graph tags to
 * crawlers (that's how link previews work) — so we fetch with crawler
 * User-Agents (facebookexternalhit / Googlebot) to get the page NAME, and try a
 * normal browser UA for any contact info that leaks into the public HTML/JSON.
 * Login-wall text is rejected. Never throws — returns whatever it could read.
 */

const UAS = [
  // Facebook's own link-preview crawler — returns the real og: tags.
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
];
const TIMEOUT_MS = 9000;
const MAX_BYTES = 1_500_000;

export interface FbInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
}

function decode(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .trim();
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  return m && m[1] ? decode(m[1]) : null;
}

function jsonField(html: string, ...keys: string[]): string | null {
  for (const k of keys) {
    const m = html.match(new RegExp(`"${k}"\\s*:\\s*"([^"]{2,200})"`, "i"));
    if (m && m[1].trim()) return decode(m[1]);
  }
  return null;
}

// Strings that mean "Facebook login wall / no real content".
const LOGIN_WALL =
  /^(facebook|meta|log ?in|log in or sign up|log into facebook|sign up|create (a |an )?(new )?account|you must log in|content (isn'?t|not) available|this content isn'?t available|page not found|watch|reels)/i;

function cleanName(raw: string | null): string | null {
  if (!raw) return null;
  let n = decode(raw);
  // "See more of X on Facebook" / "X is on Facebook" → X
  const see = n.match(/^see more of (.+?) on facebook\.?$/i) || n.match(/^(.+?) is on facebook\.?$/i);
  if (see) n = see[1];
  // Strip trailing "| Facebook", "- Home", "· Restaurant", etc.
  n = n
    .replace(/\s*[|–—\-·]\s*(facebook|home|about|posts|photos|menu|reviews|videos|community).*$/i, "")
    .trim();
  if (!n || n.length < 2) return null;
  if (LOGIN_WALL.test(n)) return null;
  if (/log in or sign up to (view|see|continue)/i.test(n)) return null;
  return n;
}

function extractName(html: string): string | null {
  return (
    cleanName(meta(html, "og:title")) ||
    cleanName(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null)
  );
}

function extractEmail(html: string): string | null {
  const mailto = html.match(/mailto:([^"'?>\s\\]+@[^"'?>\s\\]+)/i);
  const candidate =
    (mailto && decode(mailto[1])) ||
    html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  if (!candidate) return null;
  const email = candidate.trim().toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(email)) return null;
  if (/(facebook|fbcdn|sentry|example\.|noreply|@meta\.)/i.test(email)) return null;
  return email;
}

function extractPhone(html: string): string | null {
  const fromJson = jsonField(html, "phone", "phone_number", "page_phone");
  const tel = html.match(/tel:([+\d][\d\s().-]{6,})/i)?.[1];
  const candidate = fromJson || (tel && decode(tel)) || null;
  if (!candidate) return null;
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return candidate.trim();
}

function extractAddress(html: string): string | null {
  return jsonField(html, "single_line_address", "street_address", "full_address");
}

function extractWebsite(html: string): string | null {
  const wrapped = html.match(/l\.facebook\.com\/l\.php\?u=([^"&\\]+)/i);
  if (wrapped) {
    try {
      const url = decodeURIComponent(wrapped[1]);
      if (/^https?:\/\//i.test(url) && !/facebook\.com/i.test(url)) return url;
    } catch {
      /* ignore */
    }
  }
  const fromJson = jsonField(html, "website");
  if (fromJson && /^https?:\/\//i.test(fromJson) && !/facebook\.com/i.test(fromJson)) return fromJson;
  return null;
}

async function fetchHtml(url: string, ua: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9", Accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, MAX_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Canonical facebook.com URL (+ a lightweight mbasic variant). */
function normalize(input: string): { www: string; mbasic: string } | null {
  let v = input.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v.replace(/^\/+/, "")}`;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname) && !/(^|\.)fb\.com$/i.test(u.hostname)) return null;
  const path = u.pathname + u.search;
  return { www: `https://www.facebook.com${path}`, mbasic: `https://mbasic.facebook.com${path}` };
}

export async function scrapeFacebookPage(input: string): Promise<FbInfo | { error: string }> {
  const urls = normalize(input);
  if (!urls) return { error: "That doesn't look like a Facebook page URL." };

  const info: FbInfo = { name: null, email: null, phone: null, address: null, website: null };

  // Crawler UA on www first (best for the real OG name), then browser on mbasic
  // & www for any contact info that leaks into the public HTML.
  const attempts: Array<[string, string]> = [
    [urls.www, UAS[0]],
    [urls.mbasic, UAS[2]],
    [urls.www, UAS[2]],
    [urls.www, UAS[1]],
  ];

  for (const [url, ua] of attempts) {
    if (info.name && info.phone && info.address) break;
    const html = await fetchHtml(url, ua);
    if (!html) continue;
    info.name ??= extractName(html);
    info.email ??= extractEmail(html);
    info.phone ??= extractPhone(html);
    info.address ??= extractAddress(html);
    info.website ??= extractWebsite(html);
  }

  if (!info.name && !info.phone && !info.address && !info.email && !info.website) {
    return {
      error:
        "Facebook hid this page behind a login wall, so no details could be read. Please fill them in manually.",
    };
  }
  return info;
}
