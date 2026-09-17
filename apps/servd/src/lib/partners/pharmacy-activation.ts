/**
 * Whether a partner may switch a pharmacy on.
 *
 * THE FDA LICENCE IS NO LONGER A BLOCK, and that is a correction rather than a
 * loosening.
 *
 * It used to refuse activation outright until a Licence to Operate number was
 * recorded, on the argument that a pharmacy cannot legally dispense without
 * one. The argument is true and the gate did not serve it: this is a text box.
 * Nothing here verifies a number with the FDA, and nothing can — so a licensed
 * pharmacy whose number had not been typed in yet was blocked, while anything
 * at all typed into the field satisfied it. It bought the APPEARANCE of a
 * control at the price of a real one, and the people it stopped were the
 * legitimate ones.
 *
 * What replaces it is a record. Activation states whether the licence was on
 * file at the time, in the audit row and on the screen, so an operator can be
 * asked about it afterwards and a missing one keeps being visible until it is
 * fixed. A control an audit can use beats a door that only the honest bother to
 * knock on.
 *
 * TWO REFUSALS REMAIN, and both are about state rather than paperwork:
 * something already active has nothing to do, and something suspended was
 * suspended by a person whose decision Activate must not quietly erase.
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
  | {
      ok: true;
      /**
       * Present when it can be switched on but something should be chased.
       * Shown beside the button, and recorded on the audit row — not a reason
       * to stop, and not nothing either.
       */
      warning?: string;
    }
  | { ok: false; reason: "already_active" | "suspended"; message: string };

export const NO_LTO_WARNING =
  "No FDA Licence to Operate recorded yet. You can switch it on now — ask the pharmacy to " +
  "add it under Settings in Resceta, and this will keep saying so until they do.";

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
    return { ok: true, warning: NO_LTO_WARNING };
  }

  return { ok: true };
}

/** Whether a licence is on file — read the same way everywhere. */
export function hasLto(fdaLtoNumber: string | null): boolean {
  return !!fdaLtoNumber?.trim();
}
