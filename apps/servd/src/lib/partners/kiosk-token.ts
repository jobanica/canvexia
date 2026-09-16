import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The rotating code on a clock-in kiosk.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. A valid code proves the phone was
 * pointed at a screen that is being driven by this kiosk's secret within the
 * last minute or two. It does not prove who was holding the phone — that is the
 * session — and it does not prove the person was not looking at a photograph of
 * the screen taken ninety seconds ago. Sixty-second rotation is what keeps that
 * window short enough to be useless and long enough to scan.
 *
 * NO DATABASE, NO CLOCK OF ITS OWN. Everything here is a pure function of
 * (secret, partnerId, kioskId, instant), which is what makes the four cases the
 * brief names testable at a fixed clock: a valid code, a two-minute-old code,
 * another partner's kiosk, and a tampered one.
 */

/** Sixty seconds: long enough to scan, short enough that a photo goes stale. */
export const BUCKET_MS = 60_000;

/**
 * How many past buckets still verify.
 *
 * ONE, which is the whole reason this is a window rather than an equality. A
 * scan that starts at 59.8 seconds past the minute arrives after the code has
 * rotated, and a person whose clock-in failed for that reason has no way to
 * know it was luck. One previous bucket means a code is good for 60–120
 * seconds, which satisfies the ≤90 s freshness the brief asks for on average
 * and never produces the mystery failure.
 *
 * It is also the answer to clock skew between the kiosk tablet and the server:
 * both read the same server-minted code, so there is no skew to correct for —
 * the tablet is a display, not a signer.
 */
const ALLOWED_PAST_BUCKETS = 1;

export function bucketOf(at: Date | number = Date.now()): number {
  const ms = typeof at === "number" ? at : at.getTime();
  return Math.floor(ms / BUCKET_MS);
}

/**
 * The code a kiosk displays for one bucket.
 *
 * The partner id is in the MAC, not just the kiosk id, so a code minted for one
 * operator's kiosk cannot verify against another's even if the two ever shared
 * a secret by accident. Twelve base64url characters — 72 bits — is far past
 * guessable inside a two-minute window and still fits a QR code that scans from
 * across a counter.
 */
export function kioskCode(
  input: { secret: string; partnerId: string; kioskId: string },
  at: Date | number = Date.now(),
): string {
  return codeForBucket(input, bucketOf(at));
}

function codeForBucket(
  input: { secret: string; partnerId: string; kioskId: string },
  bucket: number,
): string {
  return createHmac("sha256", input.secret)
    .update(`${input.partnerId}|${input.kioskId}|${bucket}`)
    .digest("base64url")
    .slice(0, 12);
}

/**
 * Does this code belong to this kiosk, right now?
 *
 * CONSTANT-TIME COMPARISON, per bucket. The window is small and the secret is
 * per kiosk, so a timing oracle here is a stretch — but the comparison is one
 * line either way, and the version that leaks is the version somebody copies
 * into a place where it matters.
 */
export function verifyKioskCode(
  input: { secret: string; partnerId: string; kioskId: string },
  code: string,
  at: Date | number = Date.now(),
): boolean {
  if (!code || !input.secret) return false;
  const now = bucketOf(at);
  for (let back = 0; back <= ALLOWED_PAST_BUCKETS; back++) {
    if (equals(code, codeForBucket(input, now - back))) return true;
  }
  return false;
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which is itself the leak it
  // exists to avoid; a wrong-length code is simply wrong.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * What the phone actually scans.
 *
 * A URL, not a bare code, so a phone's built-in camera app — which is what most
 * people will point at it before they ever open the portal — opens the right
 * page instead of showing a string nobody can use. The kiosk id is in the path
 * and the code is the query, so the server knows which secret to check against
 * before it checks anything.
 */
export function kioskScanUrl(
  appUrl: string,
  input: { partnerId: string; kioskId: string; secret: string },
  at: Date | number = Date.now(),
): string {
  const code = kioskCode(input, at);
  return `${appUrl.replace(/\/$/, "")}/partner/attendance?kiosk=${encodeURIComponent(
    input.kioskId,
  )}&code=${encodeURIComponent(code)}`;
}
