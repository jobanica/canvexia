/**
 * Which branch a multi-branch login is currently working in.
 *
 * An owner with several shops is staff at each one; the session says WHO they
 * are, and this says WHICH of their restaurants they're looking at. Kept pure
 * and separate from the cookie plumbing so the choice can be tested — picking
 * the wrong branch means serving one shop's orders and takings under another's
 * name, which is worse than showing no data at all.
 */

export interface Membership {
  restaurantId: string;
  /** Oldest first. Ties are broken by id so the default never flickers. */
  createdAt: string;
  /**
   * The branch has been activated and is trading.
   *
   * Only a live branch can be worked in: an unactivated one has no online
   * ordering and nothing to run, so dropping an owner into it just shows them
   * an empty dashboard they can't use. They activate it from the branches list
   * instead, and go in once it's paid for.
   */
  active: boolean;
}

/**
 * Pick the active branch from what the login belongs to and what they last
 * chose.
 *
 * The requested branch wins ONLY if they're a member of it AND it's live. The
 * value arrives in a cookie, which is to say from the browser, so it's a
 * request and never a fact — and a stale cookie pointing at a branch that was
 * never activated must not strand somebody in a dashboard that can't work.
 *
 * Otherwise: their oldest LIVE branch — the shop they started with, and a
 * stable answer that doesn't move when another is added.
 *
 * If nothing is live, it falls back to the oldest membership regardless. A
 * brand-new account whose first restaurant hasn't been activated yet still has
 * to be able to open the dashboard and pay for it.
 */
export function pickBranch(
  memberships: readonly Membership[],
  requested: string | null | undefined,
): string | null {
  if (memberships.length === 0) return null;

  const byAge = [...memberships].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.restaurantId.localeCompare(b.restaurantId),
  );

  if (requested) {
    const hit = byAge.find((m) => m.restaurantId === requested);
    if (hit && hit.active) return hit.restaurantId;
  }

  return (byAge.find((m) => m.active) ?? byAge[0]).restaurantId;
}

/** May this login actually be switched into that branch? */
export function canSwitchTo(memberships: readonly Membership[], restaurantId: string): boolean {
  return memberships.some((m) => m.restaurantId === restaurantId && m.active);
}

/** Cookie holding the branch the owner last switched to. */
export const BRANCH_COOKIE = "servd_branch";
/** A working day is the useful unit; a stale value falls back harmlessly. */
export const BRANCH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
