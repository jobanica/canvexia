import { getFeaturePrices } from "@/server/billing/feature-pricing";
import { FeaturePricingTable } from "@/components/super-admin/FeaturePricingTable";

export const dynamic = "force-dynamic";

export default async function FeaturePricingPage() {
  const prices = await getFeaturePrices();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold">Feature pricing</h1>
        <p className="text-sm text-plum-ink/50">
          One-time unlock price for each feature. Edit any amount and save — untick{" "}
          <span className="font-semibold text-plum-ink/70">Sell it?</span> for anything you&apos;d rather
          keep inside a plan, or that costs you per use (SMS is metered credits; AI import burns API
          calls).
        </p>
      </div>

      <FeaturePricingTable initial={prices} />
    </div>
  );
}
