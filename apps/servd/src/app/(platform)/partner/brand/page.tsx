import Link from "next/link";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { getPartnerBrand } from "@/server/partners/brand-actions";
import { PartnerBrandForm } from "@/components/partner/PartnerBrandForm";
import { partnerBrandVars } from "@/lib/partners/brand-vars";

export default async function PartnerBrandPage() {
  // `brand.write` is the only thing this page does. The sidebar already hides
  // the link for a seat that lacks it and `savePartnerBrand` already refuses —
  // but the portal's rule is hide, don't disable, and without this a
  // salesperson got the full brand form and a rejection on submit.
  //
  // `requirePartnerPageWith` redirects to /partner rather than to login: they
  // are signed in correctly and simply do not hold it.
  const partner = await requirePartnerPageWith("brand.write");

  if (partner.status !== "approved") {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="font-heading text-2xl font-bold">Not available yet</h1>
        <p className="mt-2 text-brand-ink/60">
          Brand settings unlock once your partner account is approved.
        </p>
        <Link href="/partner" className="mt-6 inline-block text-sm font-semibold text-brand-primary">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { config, brandMode } = await getPartnerBrand(partner.id);

  return (
    // This page is outside PortalShell, so it sets the variables itself — and
    // it is the one screen where seeing them is the point.
    <div
      className="mx-auto max-w-3xl space-y-6 px-6 py-10"
      style={partnerBrandVars(partner.brand)}
    >
      <div>
        <Link href="/partner" className="text-sm font-semibold text-brand-ink/50">
          ← Dashboard
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold">Your brand</h1>
        <p className="text-sm text-brand-ink/50">
          {brandMode === "full_whitelabel"
            ? "You're on full white-label: no Servd credit anywhere your merchants or their customers look."
            : "Customer-facing pages carry a “Powered by Servd” credit; the rest is yours."}
        </p>

        {/*
          WHERE IT ACTUALLY APPLIES, listed rather than promised.

          This page used to say "your merchants see your brand", flatly. They
          did not — the only thing reading brandConfig was the invoice — so an
          operator set their colours, read that sentence, and went looking for a
          change that was never going to happen. Saying what is wired and what
          is not costs three lines and is the difference between a product that
          is unfinished and one that lies.
        */}
        <ul className="mt-3 space-y-1 text-xs text-brand-ink/45">
          <li>· This portal — your logo, your name and your colours, on every screen here.</li>
          <li>· Invoices you send your merchants — your logo, name and contacts.</li>
          <li>
            · Your merchants&rsquo; own dashboards still show Servd&rsquo;s. That one is coming;
            it is not switched on yet.
          </li>
        </ul>
      </div>

      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <PartnerBrandForm brand={config} brandMode={brandMode} />
      </section>

      <p className="text-xs text-brand-ink/40">
        Your brand mode and territory are set by CANVEXIA — get in touch if they need changing.
      </p>
    </div>
  );
}
