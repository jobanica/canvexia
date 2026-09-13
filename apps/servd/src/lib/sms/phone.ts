/**
 * Philippine mobile number normalization to E.164 (+639XXXXXXXXX).
 * Accepts the common local formats: 09XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX,
 * with spaces/dashes. Returns the canonical form, or null if it's not a valid
 * PH mobile number. We normalize so the same person is one contact regardless
 * of how they typed it.
 */
export function normalizePhPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");

  let local: string;
  if (digits.startsWith("+639") && digits.length === 13) {
    local = digits.slice(3); // after +63
  } else if (digits.startsWith("639") && digits.length === 12) {
    local = digits.slice(2);
  } else if (digits.startsWith("09") && digits.length === 11) {
    local = digits.slice(1);
  } else if (digits.startsWith("9") && digits.length === 10) {
    local = digits;
  } else {
    return null;
  }

  // local is now "9XXXXXXXXX" (10 digits, starts with 9)
  if (!/^9\d{9}$/.test(local)) return null;
  return `+63${local}`;
}
