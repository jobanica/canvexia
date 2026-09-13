import "server-only";

/**
 * How a platform-level gateway call is told which sub-account it is acting for.
 *
 * ⚠️ THIS IS THE ONE UNVERIFIED MECHANISM IN PHASE 4, AND IT IS DELIBERATELY
 * ALONE IN A FILE.
 *
 * D5 chose Option B: partners are sub-accounts beneath CANVEXIA's own gateway
 * platform, CANVEXIA holds the only credential, and each call names the
 * sub-account it acts for. Everything else in Phase 4 — per-partner provider
 * resolution, per-partner webhooks, partner-scoped settlement — is true under
 * either topology and is built on solid ground. This single detail is not: how
 * Xendit expects a platform to name a sub-account has not been confirmed with
 * them (docs/canvexia/xendit-questions.md §1).
 *
 * So it lives here, behind one function, and nothing else in the billing code
 * knows the shape of it. When Xendit answers — a different header name, a query
 * parameter, a field in the body, an entirely different flow — this file
 * changes and nothing else has to.
 *
 * The header below is the widely-documented form for Xendit's platform API. It
 * is an INFORMED GUESS, not a verified fact, and it is written here rather than
 * in the provider so that nobody reads it as settled.
 */

export interface SubAccountBinding {
  /** Extra headers merged into every request made for this sub-account. */
  headers: Record<string, string>;
  /** The sub-account this binding names, for logging and error messages. */
  subAccountId: string;
}

export function bindSubAccount(subAccountId: string): SubAccountBinding {
  return {
    subAccountId,
    headers: { "for-user-id": subAccountId },
  };
}

/**
 * Whether we are confident enough in the mechanism above to move real money.
 *
 * Read by the provider before it makes a live sub-account call. It exists so the
 * failure mode of an unconfirmed guess is a clear refusal at the boundary rather
 * than a request that silently settles into the wrong account — which, with N
 * partners' revenue flowing through one platform credential, is the worst
 * outcome available here.
 *
 * Flip to true once xendit-questions.md §1.1 and §1.2 are answered and a
 * sandbox call has been seen to land in the right sub-account.
 */
export const SUB_ACCOUNT_MECHANISM_CONFIRMED = false;
