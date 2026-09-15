import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCTS } from "@servd/core";
import { partnerBySlug } from "@/server/partners/prospects";
import { provisionableProducts } from "@/server/products";
import { LeadForm } from "@/components/partner/LeadForm";

/**
 * A partner's public lead form.
 *
 * OUTSIDE the (platform) route group on purpose: this is the one page in the
 * portal a stranger sees, it carries the PARTNER's brand rather than
 * CANVEXIA's, and it must not inherit the portal chrome — a "Log out" button on
 * a page nobody is signed into is a page that looks broken.
 *
 * `noindex`: a partner's lead form is for the people they hand it to, not for
 * search results that would put two operators' forms side by side.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LeadFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const partner = await partnerBySlug(slug);
  // An unknown OR unapproved slug 404s. A lead form is a promise to follow up,
  // and a partner who cannot trade should not be collecting numbers.
  if (!partner) notFound();

  const brand = (partner.brandConfig ?? {}) as { displayName?: string };
  const name = brand.displayName || partner.name;
  const products = provisionableProducts().map((id) => ({
    id,
    name: PRODUCTS[id].name,
    description: PRODUCTS[id].description,
  }));

  return (
    /*
      brand-canvexia as the BASE, not Servd's cream.
      
      The brand tokens default to Servd's identity in globals.css, which is
      right for Servd's own pages and wrong here: this is a CANVEXIA partner's
      page, and a partner with no brandConfig yet should inherit CANVEXIA's
      look rather than the restaurant product's orange. A5 overrides these same
      five variables per partner, so this is the fallback and not a ceiling.
    */
    <main className="brand-canvexia min-h-screen bg-brand-surface px-5 py-12 text-brand-ink">
      <div className="mx-auto max-w-lg">
        <p className="font-heading text-xl font-bold">{name}</p>
        <h1 className="mt-6 font-heading text-3xl font-extrabold leading-tight">
          Tell us about your business
        </h1>
        <p className="mt-2 text-brand-ink/60">
          Software for restaurants, pharmacies and more — set up for you, here in your
          city. Leave your details and {name} will call you.
        </p>

        <div className="mt-6">
          <LeadForm slug={partner.slug ?? slug} partnerName={name} products={products} />
        </div>

        {/*
          The one CANVEXIA credit on a partner-facing page, and it is here
          because the brief puts it in the footer and nowhere else. It does not
          appear on anything a MERCHANT sees.
        */}
        <p className="mt-8 text-center text-xs text-brand-ink/35">Partner portal by CANVEXIA.</p>
      </div>
    </main>
  );
}
