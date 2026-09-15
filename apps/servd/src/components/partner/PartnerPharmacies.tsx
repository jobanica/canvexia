"use client";

import { useActionState } from "react";
import {
  activatePharmacyAction,
  type ActivateState,
} from "@/server/partners/pharmacy-actions";
import type { PartnerPharmacyRow } from "@/server/partners/pharmacies";

const IDLE: ActivateState = { status: "idle" };

const BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Live ✓", cls: "bg-brand-primary/15 text-brand-primary" },
  pending: { label: "Pending", cls: "bg-brand-ink/5 text-brand-ink/60" },
  suspended: { label: "Suspended", cls: "bg-red-100 text-red-700" },
};

/**
 * The pharmacies a partner owns, and the one button that changes their status.
 *
 * The button is absent — not disabled — when the pharmacy cannot be activated,
 * with the reason in its place. A disabled control that does not say why is the
 * thing people click twice and then write a support message about, and here the
 * reason is always actionable: the pharmacy has to record its licence.
 */
export function PartnerPharmacies({ pharmacies }: { pharmacies: PartnerPharmacyRow[] }) {
  const [state, action, pending] = useActionState(activatePharmacyAction, IDLE);

  if (pharmacies.length === 0) return null;

  const live = pharmacies.filter((p) => p.status === "active").length;

  return (
    <div className="mt-4 rounded-tile border border-brand-ink/10 bg-white p-5">
      <p className="mb-1 text-sm font-semibold">
        Your pharmacies ({live} live · {pharmacies.length - live} not yet)
      </p>
      <p className="mb-3 text-xs text-brand-ink/50">
        A pharmacy is set up pending and cannot dispense until you switch it on.
        That needs its FDA Licence to Operate recorded first — the pharmacy does
        that under Settings in Resceta.
      </p>

      {state.status === "error" && (
        <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className="mb-3 rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
          {state.message}
        </p>
      )}

      <ul className="divide-y divide-brand-ink/5">
        {pharmacies.map((p) => {
          const badge = BADGE[p.status] ?? { label: p.status, cls: "bg-brand-ink/5 text-brand-ink/60" };
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-brand-ink/45">
                  Set up {new Date(p.createdAt).toLocaleDateString()} ·{" "}
                  {p.hasLto ? "FDA LTO on file" : "no FDA LTO yet"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {p.activation.ok ? (
                  <form action={action}>
                    <input type="hidden" name="pharmacyId" value={p.id} />
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {pending ? "Activating…" : "Activate"}
                    </button>
                  </form>
                ) : (
                  p.status !== "active" && (
                    <span className="max-w-[16rem] text-right text-xs text-brand-ink/45">
                      {p.activation.message}
                    </span>
                  )
                )}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
