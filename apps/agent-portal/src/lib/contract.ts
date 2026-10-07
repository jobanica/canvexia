import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Contracts: the template, the signing link, and the minimum term. Pure.
 */

/**
 * Placeholders a template may use. Written {{like_this}}. Anything else in
 * double braces is left as it is, so a typo shows up on the page where the
 * admin will see it, rather than silently becoming blank.
 */
export const PLACEHOLDERS = [
  "business_name",
  "owner_name",
  "product_name",
  "plan",
  "activation_fee",
  "monthly_fee",
  "minimum_term_months",
  "date",
] as const;
export type ContractVars = Record<(typeof PLACEHOLDERS)[number], string>;

export function renderTemplate(body: string, vars: ContractVars): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) =>
    key in vars ? vars[key as keyof ContractVars] : whole,
  );
}

/** The minimum term ends this many calendar months after signing. */
export function minimumTermEnd(signedAt: Date, months: number): Date {
  const d = new Date(signedAt);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// ---------------------------------------------------------------------------
// Signing links
// ---------------------------------------------------------------------------

/**
 * A signing link is a token naming one customer, with an expiry, MACed with
 * CONTRACT_LINK_SECRET. Stateless: nothing to store, and anyone holding the
 * link can sign for that customer until it expires — which is the point, since
 * it is handed to the customer (or opened on the agent's phone in front of
 * them). It cannot be altered to name another customer.
 */
export const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function mac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSigningToken(referralId: string, secret: string, now = new Date()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
  const payload = Buffer.from(JSON.stringify({ r: referralId, e: expiresAt.getTime() })).toString("base64url");
  return { token: `${payload}.${mac(secret, payload)}`, expiresAt };
}

export function verifySigningToken(
  token: string,
  secret: string,
  now = new Date(),
): { ok: true; referralId: string } | { ok: false; reason: "malformed" | "bad_signature" | "expired" } {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  const expected = Buffer.from(mac(secret, payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_signature" };
  let body: { r?: unknown; e?: unknown };
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof body.r !== "string" || typeof body.e !== "number") return { ok: false, reason: "malformed" };
  if (now.getTime() > body.e) return { ok: false, reason: "expired" };
  return { ok: true, referralId: body.r };
}

/** The secret, or an error naming the variable — never a silent default. */
export function contractLinkSecret(): string {
  const s = process.env.CONTRACT_LINK_SECRET;
  if (!s || s.length < 32) throw new Error("CONTRACT_LINK_SECRET is not set (32+ characters)");
  return s;
}

/** A drawn signature arrives as a PNG data URL. Bytes out, or null. */
export function signatureBytes(dataUrl: string, maxBytes = 500_000): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  if (bytes.length < 100 || bytes.length > maxBytes) return null;
  return bytes;
}
