/**
 * Reading a scanned string. NO CRYPTO, and that is the whole reason this is a
 * file of its own.
 *
 * The scanner runs in the browser, so anything it imports is bundled for the
 * browser — and `kiosk-token.ts` imports `node:crypto`, which webpack cannot
 * resolve there. Verification is a server job anyway: this half only decides
 * what the camera read, never whether it is valid.
 */

/** The kiosk id and code out of a scanned string, or null. */
export function parseScan(raw: string): { kioskId: string; code: string } | null {
  const text = raw.trim();
  if (!text) return null;

  // THE HTTP PREFIX IS CHECKED, not left to `new URL` throwing. It does not
  // throw on "k-1:abc" — WHATWG reads "k-1:" as a scheme — so a try/catch here
  // silently swallows the bare form and returns null for every in-app scan.
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const kioskId = url.searchParams.get("kiosk") ?? "";
      const code = url.searchParams.get("code") ?? "";
      return kioskId && code ? { kioskId, code } : null;
    } catch {
      return null;
    }
  }

  const [kioskId, code] = text.split(":");
  return kioskId && code ? { kioskId, code } : null;
}
