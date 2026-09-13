/**
 * The login handle a demo storefront gets when it becomes a real account.
 *
 * Restaurant owners are given this over the counter or down the phone, and they
 * type it into a login box on a shared terminal — so the rules exist to stop a
 * handle that can't survive being repeated out loud: it's lower-cased (nobody
 * remembers which letter was capital), trimmed (a pasted name arrives with a
 * space), and restricted to characters that read unambiguously.
 *
 * It also becomes the local part of a synthetic email address, which is the
 * real reason spaces and @ can't be allowed through.
 *
 * Pure and shared: the super-admin and the partner both mint accounts, and a
 * username accepted by one has to be accepted by the other, or a partner hits
 * "already taken" on a name that was never offered to them.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** Letters, digits, dot, dash, underscore. No spaces, no @, no unicode. */
const SHAPE = /^[a-z0-9._-]+$/;

export type UsernameResult = { ok: true; username: string } | { ok: false; error: string };

export function normalizeUsername(raw: unknown): UsernameResult {
  if (typeof raw !== "string") return { ok: false, error: "Enter a username." };
  const username = raw.trim().toLowerCase();
  if (username.length < USERNAME_MIN) {
    return { ok: false, error: `Username must be at least ${USERNAME_MIN} characters` };
  }
  if (username.length > USERNAME_MAX) {
    return { ok: false, error: `Username must be at most ${USERNAME_MAX} characters` };
  }
  if (!SHAPE.test(username)) {
    return { ok: false, error: "Letters, numbers, dot, dash, underscore" };
  }
  return { ok: true, username };
}
