"use client";

import { useActionState, useState } from "react";
import { saveOperatorTerms, type OperatorState } from "@/server/partners/operator-actions";

export interface OperatorTerms {
  id: string;
  name: string;
  tier: string;
  territory: string | null;
  slug: string | null;
  revenueSharePct: number;
  collectionMode: string;
  brandMode: string;
}

const FIELD = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-plum-ink/50 mb-1";

/**
 * The commercial terms CANVEXIA has with one operator.
 *
 * `tier` drives the whole form, so it is bound to local state rather than left
 * uncontrolled: a legacy partner must show a share of 0 and no way to type over
 * it, and an operator must not be savable at 0. The server re-checks both
 * through validateRevenueShare — this is the half that stops someone reaching
 * the error in the first place, not the half that enforces it.
 */
export function PartnerOperatorForm({ partner }: { partner: OperatorTerms }) {
  const [state, action] = useActionState<OperatorState, FormData>(saveOperatorTerms, null);
  const [tier, setTier] = useState(partner.tier);
  const isOperator = tier === "operator";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={partner.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL}>Tier</label>
          <select
            name="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className={FIELD}
          >
            <option value="reseller">Reseller — legacy, no revenue share</option>
            <option value="affiliate">Affiliate — legacy, no revenue share</option>
            <option value="operator">Operator — CANVEXIA city partner</option>
          </select>
        </div>

        <div>
          <label className={LABEL}>Partner share %</label>
          <input
            name="revenueSharePct"
            type="number"
            min={isOperator ? 1 : 0}
            max={isOperator ? 99 : 0}
            step={1}
            disabled={!isOperator}
            defaultValue={partner.revenueSharePct}
            key={tier /* reset the field when the tier changes under it */}
            className={`${FIELD} disabled:bg-plum-ink/5 disabled:text-plum-ink/40`}
          />
          <p className="mt-1 text-xs text-plum-ink/45">
            {isOperator
              ? `Partner keeps this much of merchant revenue; CANVEXIA takes the rest.`
              : `Legacy partners are on the zero-cut agreement they signed. Switch to Operator to set a share.`}
          </p>
        </div>

        <div>
          <label className={LABEL}>Territory</label>
          <input
            name="territory"
            defaultValue={partner.territory ?? ""}
            placeholder="Davao City"
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL}>Slug</label>
          <input
            name="slug"
            defaultValue={partner.slug ?? ""}
            placeholder="canvexia-davao"
            className={FIELD}
          />
          <p className="mt-1 text-xs text-plum-ink/45">
            Used for {partner.slug || "{slug}"}.canvexia.app until they bring their own domain.
          </p>
        </div>

        <div>
          <label className={LABEL}>Who collects</label>
          <select name="collectionMode" defaultValue={partner.collectionMode} className={FIELD}>
            <option value="partner_collects">Partner — merchants pay into their own gateway</option>
            <option value="hq_collects">CANVEXIA — merchants pay the platform</option>
          </select>
        </div>

        <div>
          <label className={LABEL}>Brand mode</label>
          <select name="brandMode" defaultValue={partner.brandMode} className={FIELD}>
            <option value="powered_by">Powered by — partner brand, CANVEXIA credited</option>
            <option value="full_whitelabel">Full white-label — no CANVEXIA mention</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand text-white">
          Save terms
        </button>
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
        {state?.ok && <span className="text-sm text-mango">{state.message ?? "Saved ✓"}</span>}
      </div>
    </form>
  );
}
