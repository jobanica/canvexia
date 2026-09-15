import Link from "next/link";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { listPlanPrices } from "@/server/partners/revenue";
import { PortalNav } from "@/components/partner/PortalNav";
import { PricingForm } from "@/components/partner/PricingForm";

export default async function PartnerPricingPage() {
  const partner = await requirePartnerPageWith("revenue.pricing");
  const rows = await listPlanPrices(partner.id);

  return (
    <>
      <PortalNav partner={partner} />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Link href="/partner/revenue" className="text-sm text-brand-ink/50 hover:text-brand-ink">
          ← Revenue
        </Link>
        <h1 className="mt-4 font-heading text-2xl font-bold">Your pricing</h1>
        <p className="mt-1 max-w-readable text-sm text-brand-ink/55">
          You decide what merchants in your city pay, at or above the floor CANVEXIA sets.
          Your {partner.revenueSharePct}% is a share of what you actually charge.
        </p>

        {rows.length === 0 ? (
          <p className="mt-6 rounded-tile border border-brand-ink/10 bg-white p-6 text-sm text-brand-ink/55">
            No plans are published yet.
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            {rows.map((r) => (
              <PricingForm key={r.planId} row={r} />
            ))}
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-brand-ink/45">
          The floor exists because partners talk to each other&rsquo;s merchants. Undercutting
          does not just start a price war between two operators — CANVEXIA&rsquo;s share is a
          percentage of whatever was charged, so the race to the bottom comes out of
          everyone&rsquo;s revenue.
        </p>
      </div>
    </>
  );
}
