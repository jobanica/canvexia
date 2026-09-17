"use client";

import { useActionState } from "react";
import { activatePharmacyAction, type ActivateState } from "@/server/partners/pharmacy-actions";
import type { ActivationCheck } from "@/lib/partners/pharmacy-activation";

const IDLE: ActivateState = { status: "idle" };

/**
 * Switching a pharmacy on, from the pharmacy's own page.
 *
 * REPORTED — "I tried to create a merchant for Resceta, but I don't know where
 * to activate it." The only control was a card on the partner-wide overview,
 * which a field agent's dashboard forks away from before rendering. So the
 * account existed, could not dispense, and there was nowhere to say so.
 *
 * A FIELD AGENT PRESSES IT. The action checks `merchants.create` — the key the
 * seat that opened the account already holds — rather than `merchants.manage`,
 * which bundles changing plans and suspending shops and which a field agent
 * correctly does not have. Activating is the last step of opening, done by the
 * person standing in the shop.
 *
 * THE STATE IS SHOWN TO EVERYONE WHO CAN SEE THE MERCHANT; the BUTTON only to a
 * seat that may press it. That is a deliberate departure from the portal's
 * usual hide-don't-disable rule, and the reason is that this is not a hidden
 * capability — it is a fact about an account somebody is looking at. A field
 * agent who signed this pharmacy needs to know it cannot dispense yet and who
 * to ask; hiding the whole thing is what produced the bug report.
 *
 * The button is ABSENT, not disabled, when the pharmacy cannot be activated,
 * with the reason in its place — and the reason is always actionable: record
 * the licence.
 */
export function PharmacyActivate({
  merchantId,
  status,
  hasLto,
  activation,
  canActivate,
}: {
  merchantId: string;
  status: string;
  /** Drives the standing reminder once it is live. */
  hasLto: boolean;
  activation: ActivationCheck;
  /** Does this seat hold the capability the action checks? */
  canActivate: boolean;
}) {
  const [state, action, pending] = useActionState(activatePharmacyAction, IDLE);

  if (status === "active") {
    return (
      <div
        className={`mt-8 rounded-tile border p-5 ${
          hasLto
            ? "border-brand-primary/30 bg-brand-primary/[0.04]"
            : "border-mango/40 bg-mango/[0.06]"
        }`}
      >
        <p className="text-sm font-semibold">This pharmacy is live</p>
        {hasLto ? (
          <p className="mt-1 text-sm text-brand-ink/55">
            It can dispense. Its FDA Licence to Operate is on file.
          </p>
        ) : (
          /*
            IT KEEPS SAYING SO. The licence is no longer a block — it is a text
            box nothing can verify, and blocking on it stopped licensed
            pharmacies whose number had not been typed in yet. What replaces
            the block is this: a standing, visible reminder on the account
            until somebody records it, rather than a door that quietly nobody
            had to walk through.
          */
          <p className="mt-1 text-sm text-brand-ink/70">
            <strong>Still no FDA Licence to Operate on file.</strong> The pharmacy records it
            under Settings in Resceta. This notice stays until they do.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-tile border border-mango/40 bg-mango/[0.06] p-5">
      <p className="text-sm font-semibold">
        {status === "suspended" ? "This pharmacy is suspended" : "Not live yet"}
      </p>
      <p className="mt-1 text-sm text-brand-ink/70">
        {status === "suspended"
          ? "Its counter refuses to ring up a sale until it is switched back on."
          : "A pharmacy is set up pending and cannot dispense until it is switched on."}
      </p>

      {state.status === "error" && (
        <p role="alert" className="mt-3 rounded-lg border border-guava/40 bg-guava/10 p-2 text-sm text-guava">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className="mt-3 rounded-lg border border-brand-primary/30 bg-brand-primary/10 p-2 text-sm text-brand-primary">
          {state.message}
        </p>
      )}

      {/*
        A WARNING SITS ABOVE THE BUTTON, not in place of it. There is something
        to chase and nothing to stop.
      */}
      {activation.ok && activation.warning && (
        <p className="mt-3 rounded-lg border border-brand-ink/10 bg-white p-3 text-sm text-brand-ink/70">
          {activation.warning}
        </p>
      )}

      {!activation.ok ? (
        <p className="mt-3 text-sm text-brand-ink/60">{activation.message}</p>
      ) : canActivate ? (
        <form action={action} className="mt-3">
          <input type="hidden" name="pharmacyId" value={merchantId} />
          <button
            disabled={pending}
            className="rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Switching on…" : "Activate this pharmacy"}
          </button>
        </form>
      ) : (
        // Named, not hidden. A seat whose operator has taken `merchants.create`
        // away should be able to tell whose job the last step is rather than
        // wondering why nothing happens.
        <p className="mt-3 text-sm text-brand-ink/60">
          Your seat cannot switch a pharmacy on. Whoever opens merchant accounts at your partner
          can.
        </p>
      )}
    </div>
  );
}
