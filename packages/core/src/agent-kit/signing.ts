import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Request signing between a product and the agent portal, both directions.
 *
 * HMAC-SHA256 with the product's secret over
 *
 *     `${timestamp}.${METHOD}.${pathname}.${rawBody}`
 *
 * The timestamp is inside the signed string, not merely sent beside it, or a
 * captured request could be replayed forever with a fresh timestamp header.
 * The method and path are inside it so a signature for one endpoint cannot be
 * replayed against another. Query strings are left out: proxies reorder and
 * re-encode them, and no endpoint here carries meaning in one.
 *
 * The body is signed exactly as sent. Verify against the raw text, never
 * against JSON.stringify(JSON.parse(body)) — key order and whitespace are not
 * preserved by a round-trip, and the signature would fail on a request that
 * was perfectly genuine.
 *
 * Node's crypto, not Web Crypto: this runs in route handlers and server
 * actions, never in Edge middleware, and timingSafeEqual is the point.
 */

export const SIGNATURE_HEADERS = {
  /** The product's slug. Says which secret to verify with. */
  product: "x-canvexia-product",
  /** Unix seconds when the request was signed. */
  timestamp: "x-canvexia-timestamp",
  /** `sha256=<hex>` */
  signature: "x-canvexia-signature",
} as const;

/** Requests older (or further in the future) than this are refused. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function canonicalString(
  timestamp: string,
  method: string,
  pathname: string,
  rawBody: string,
): string {
  return `${timestamp}.${method.toUpperCase()}.${pathname}.${rawBody}`;
}

/**
 * The body is a string for JSON and bytes for an uploaded receipt image. Both
 * are signed as bytes after the same prefix, so a string body signs exactly as
 * canonicalString() describes.
 */
export type SignedBody = string | Uint8Array;

export function signRequest(
  secret: string,
  timestamp: string,
  method: string,
  pathname: string,
  rawBody: SignedBody,
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${method.toUpperCase()}.${pathname}.`, "utf8")
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest("hex");
  return `sha256=${mac}`;
}

/** Headers for an outgoing signed request. */
export function signedHeaders(opts: {
  productSlug: string;
  secret: string;
  method: string;
  pathname: string;
  rawBody: SignedBody;
  now?: Date;
}): Record<string, string> {
  const timestamp = String(Math.floor((opts.now ?? new Date()).getTime() / 1000));
  return {
    [SIGNATURE_HEADERS.product]: opts.productSlug,
    [SIGNATURE_HEADERS.timestamp]: timestamp,
    [SIGNATURE_HEADERS.signature]: signRequest(
      opts.secret,
      timestamp,
      opts.method,
      opts.pathname,
      opts.rawBody,
    ),
  };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "malformed" | "stale" | "bad_signature" };

export function verifyRequest(opts: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  method: string;
  pathname: string;
  rawBody: SignedBody;
  now?: Date;
  toleranceSeconds?: number;
}): VerifyResult {
  const { timestamp, signature } = opts;
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "malformed" };
  if (!signature || !/^sha256=[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, reason: "malformed" };
  }

  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const tolerance = opts.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  // Both directions: a timestamp from the future is a clock problem at best
  // and a pre-signed replay at worst.
  if (Math.abs(nowSec - Number(timestamp)) > tolerance) return { ok: false, reason: "stale" };

  const expected = Buffer.from(
    signRequest(opts.secret, timestamp, opts.method, opts.pathname, opts.rawBody),
  );
  const given = Buffer.from(signature);
  // Equal length is guaranteed by the regex above; checked anyway because
  // timingSafeEqual throws rather than returning false on a mismatch.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
