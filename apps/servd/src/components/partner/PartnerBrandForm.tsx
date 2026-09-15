"use client";

import { useActionState } from "react";
import type { PartnerBrandConfig } from "@servd/core";
import { savePartnerBrand, type BrandState } from "@/server/partners/brand-actions";

const FIELD = "w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm";
const LABEL = "mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/50";

/**
 * A partner's own brand. What their merchants see instead of Servd, and — once
 * the brand engine lands in Phase 5 — what those merchants' diners see too.
 */
export function PartnerBrandForm({
  brand,
  brandMode,
}: {
  brand: PartnerBrandConfig;
  brandMode: string;
}) {
  const [state, action] = useActionState<BrandState, FormData>(savePartnerBrand, null);
  const whiteLabel = brandMode === "full_whitelabel";

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL}>Business name</label>
          <input name="displayName" defaultValue={brand.displayName ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Legal name</label>
          <input name="legalName" defaultValue={brand.legalName ?? ""} className={FIELD} />
          <p className="mt-1 text-xs text-brand-ink/45">For invoices and legal text.</p>
        </div>
        <div>
          <label className={LABEL}>Logo URL</label>
          <input
            name="logoUrl"
            defaultValue={brand.logoUrl ?? ""}
            placeholder="https://…"
            className={FIELD}
          />
        </div>
        <div>
          <label className={LABEL}>Logo URL (dark backgrounds)</label>
          <input name="logoDarkUrl" defaultValue={brand.logoDarkUrl ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Primary colour</label>
          <input
            name="primaryColor"
            defaultValue={brand.primaryColor ?? ""}
            placeholder="#FF8A1E"
            className={FIELD}
          />
        </div>
        <div>
          <label className={LABEL}>Accent colour</label>
          <input
            name="accentColor"
            defaultValue={brand.accentColor ?? ""}
            placeholder="#FF4D6D"
            className={FIELD}
          />
        </div>
      </div>

      <div className="rounded-lg border border-brand-ink/10 bg-brand-ink/[0.02] p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
          Support contacts
        </p>
        <p className="mb-3 text-xs text-brand-ink/45">
          Where your merchants go for help. These replace Servd&apos;s own contacts on their
          dashboards — if you leave them blank, your merchants will be asking us.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL}>Email</label>
            <input name="supportEmail" defaultValue={brand.supportEmail ?? ""} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <input name="supportPhone" defaultValue={brand.supportPhone ?? ""} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Link</label>
            <input
              name="supportUrl"
              defaultValue={brand.supportUrl ?? ""}
              placeholder="https://m.me/…"
              className={FIELD}
            />
          </div>
        </div>
      </div>

      <div>
        <label className={LABEL}>Legal footer</label>
        <textarea
          name="legalFooter"
          rows={2}
          defaultValue={brand.legalFooter ?? ""}
          className={FIELD}
        />
        <p className="mt-1 text-xs text-brand-ink/45">
          {whiteLabel
            ? "Shown under your merchants' customer-facing pages."
            : "Shown alongside the “Powered by Servd” credit your plan includes."}
        </p>
      </div>

      <div>
        <label className={LABEL}>Favicon URL</label>
        <input name="faviconUrl" defaultValue={brand.faviconUrl ?? ""} className={FIELD} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand text-white">
          Save brand
        </button>
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
        {state?.ok && <span className="text-sm text-brand-primary">{state.message ?? "Saved ✓"}</span>}
      </div>
    </form>
  );
}
