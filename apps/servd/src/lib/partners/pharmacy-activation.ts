/**
 * Whether a partner may switch a pharmacy on.
 *
 * A pharmacy is provisioned `pending` because it cannot legally dispense before
 * its FDA Licence to Operate is on file, and a platform that defaulted to
 * `active` would be the one that enabled it. That reasoning only holds if
 * something actually checks — otherwise "pending on purpose" is a comment.
 *
 * So the licence number IS the gate. Not the platform verifying a licence with
 * the FDA, which it cannot do; the pharmacy asserting it has one, recorded
 * against a named person and a timestamp. That is the control an audit can
 * actually use, and it is the reason activation belongs to the partner who owns
 * the merchant rather than to a psql session.
 *
 * Pure so the rule can be tested exhaustively without a database, a session or
 * a browser — the same reason `roles.ts` is pure on the Resceta side.
 */

export interface PharmacyForActivation {
  status: string;
  /** FDA Licence to Operate, as recorded by the pharmacy in its own settings. */
  fdaLtoNumber: string | null;
}

export type ActivationCheck =
  | { ok: true }
  | { ok: false; reason: "already_active" | "suspended" | "no_lto"; message: string };

export function canActivatePharmacy(pharmacy: PharmacyForActivation): ActivationCheck {
  if (pharmacy.status === "active") {
    return { ok: false, reason: "already_active", message: "This pharmacy is already active." };
  }

  // A suspended merchant is a decision somebody made; a partner un-suspending
  // it by pressing Activate would erase that decision without recording one.
  if (pharmacy.status === "suspended") {
    return {
      ok: false,
      reason: "suspended",
      message: "This pharmacy is suspended. Contact CANVEXIA to have it reviewed.",
    };
  }

  if (!pharmacy.fdaLtoNumber?.trim()) {
    return {
      ok: false,
      reason: "no_lto",
      message:
        "No FDA Licence to Operate on file. The pharmacy records it under Settings in Resceta; " +
        "it cannot dispense until it is there.",
    };
  }

  return { ok: true };
}
