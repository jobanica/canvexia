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
          What each feature used to cost as a one-time unlock.
        </p>
      </div>

      {/*
        SAYS SO RATHER THAN LOOKING BROKEN. The shelf is retired — Servd sells
        one plan, Standard at ₱999/mo, and every feature here is in it. The
        prices stay as the record of what was charged, and the page stays
        because a shop that bought one still owns it.

        `retireOneTimeStore()` forces `enabled` off over whatever is stored, so
        ticking "Sell it?" here changes nothing a customer can see. Better to
        say that out loud than to let somebody tick it and wonder.
      */}
      <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm text-plum-ink">
        <p className="font-semibold">Nothing here is on sale any more.</p>
        <p className="mt-1 text-plum-ink/70">
          Servd sells one plan — Standard, ₱999/mo — and it includes every feature below. The
          content scheduler is the exception and keeps its own ₱499/mo subscription. These prices
          are kept as the record of what was charged; shops that bought a feature outright still
          own it, on whatever plan they are on. Editing an amount here does not put it back on
          sale.
        </p>
      </div>

      <FeaturePricingTable initial={prices} />
    </div>
  );
}
