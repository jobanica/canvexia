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
 * Normalising what a customer typed is shared with every product (they
 * normalise before sending), so it lives in the connection kit.
 */
export { normalizeReferralCode } from "@servd/core/agent-kit/ref";
