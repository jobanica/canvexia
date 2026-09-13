/**
 * Philippine mobile numbers for customer-facing forms.
 *
 * Locally these are always 11 digits starting 09 (e.g. 09171234567). Customers
 * often paste the international form (+639171234567 / 639171234567), so we
 * normalise that to the local 0-prefixed form first and then insist on exactly
 * 11 digits — anything longer is a typo.
 */

/** Digits only, with a +63 / 63 country prefix rewritten to a leading 0. */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length >= 12) return `0${digits.slice(2)}`;
  return digits;
}

/** True when `raw` is a usable 11-digit PH number. */
export function isValidPhone(raw: string): boolean {
  return /^0\d{10}$/.test(normalizePhone(raw));
}

/**
 * Why `raw` isn't acceptable, or null when it is. Blank returns null so the
 * field only complains once the customer has typed something.
 */
export function phoneError(raw: string): string | null {
  const v = normalizePhone(raw);
  if (!v) return null;
  if (v.length > 11) return "That's too long — a phone number is 11 digits (e.g. 09171234567).";
  if (v.length < 11) return `That's only ${v.length} digit${v.length === 1 ? "" : "s"} — it should be 11.`;
  if (!v.startsWith("0")) return "A phone number should start with 0 (e.g. 09171234567).";
  return null;
}
