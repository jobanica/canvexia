/**
 * Referral capture — `?ref=CODE` into a 30-day cookie.
 *
 * Edge-safe on purpose (no node:crypto, no zod): products call it from their
 * middleware, which runs before anything else and on every route, so a
 * visitor who lands on any page with ?ref= is attributed even if they sign up
 * days later from a different page.
 *
 * Imported as `@servd/core/agent-kit/ref`, NOT from `@servd/core/agent-kit`,
 * which pulls in node:crypto.
 */

export const REF_COOKIE = "cvx_ref";
export const REF_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * What a customer typed → the stored form of a code: uppercased, spaces and
 * dashes dropped. Null for anything that cannot be a code, so an old invite
 * marker or junk in ?ref= reads as "no code" rather than as an error.
 */
export function normalizeReferralCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const code = input.toUpperCase().replace(/[\s-]+/g, "");
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return null;
  return code;
}

/** The code to remember from this URL, or null to leave any cookie alone. */
export function refFromSearchParams(params: URLSearchParams): string | null {
  return normalizeReferralCode(params.get("ref"));
}

/**
 * Cookie options. httpOnly: only the server reads it back (to prefill the
 * signup form), so page scripts have no reason to see it. lax: it must
 * survive the top-level navigation from a shared link.
 */
export const REF_COOKIE_OPTIONS = {
  maxAge: REF_COOKIE_MAX_AGE,
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
};
