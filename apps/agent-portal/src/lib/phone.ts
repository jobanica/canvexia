/**
 * Philippine mobile numbers to one canonical form, 639XXXXXXXXX, so that
 * "0917 123 4567", "+63 917-123-4567" and "9171234567" compare equal.
 *
 * Used for the self-referral check, which is only as good as this. Anything
 * that is not recognisably a PH mobile comes back as its bare digits, which
 * still compares equal to itself.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D+/g, "");
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  return digits;
}

export function samePhone(a: string, b: string): boolean {
  const na = normalizePhone(a);
  return na.length >= 7 && na === normalizePhone(b);
}
