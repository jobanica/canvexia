import { randomInt } from "node:crypto";

/**
 * Referral codes: six characters, uppercase, from an alphabet with the
 * look-alikes removed (no 0/O, 1/I/L). An agent reads their code out loud to a
 * restaurant owner over the counter; a code that can be misheard is a
 * commission paid to nobody.
 *
 * 30^6 ≈ 729 million codes. Collisions are handled by the unique index and a
 * retry, not by this function.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ2345679";
export const CODE_LENGTH = 6;

export function generateReferralCode(rand: (max: number) => number = randomInt): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return out;
}

/**
 * What a customer typed → what is stored. Uppercased, spaces and dashes
 * dropped, because "abc 123" and "ABC-123" are the same code to a person.
 * Returns null for anything that cannot be a code, so a stale `?ref=` from an
 * old invite link reads as "no code" rather than as an error.
 */
export function normalizeReferralCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const code = input.toUpperCase().replace(/[\s-]+/g, "");
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return null;
  return code;
}
