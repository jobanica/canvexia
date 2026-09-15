import { Section, SectionHead } from "./ui";
import { SITE } from "@/lib/site";

/**
 * Section 6's tail: "Why this isn't networking."
 *
 * The audience is skeptical of MLM, so the answer is structural rather than a
 * denial: here is where the company's money comes from, and here is where it
 * does not. If CANVEXIA earned from signing partners, the incentive would be to
 * sign partners. It earns from merchant subscriptions, so it is in trouble if a
 * partner's merchants churn — which is the only assurance worth giving.
 */
const EARNS = [
  `${SITE.hqShare}% of every merchant's monthly subscription`,
  "One-time city licence fees",
  "Nothing else",
];

const DOESNT = [
  "No commission for recruiting partners",
  "No downline, no levels, no volume targets",
  "No purchase of inventory, packs or starter kits",
  "No payment for attending anything",
];

export function Compare() {
  return (
    <Section tone="ink">
      <SectionHead
        eyebrow="Why this isn't networking"
        tone="light"
        title="Where CANVEXIA earns, and where it doesn't."
        lead="If we made money signing partners, we would sign anybody. We make money when your merchants keep paying, which means we lose when you do."
      />

      <div className="mt-12 grid gap-px overflow-hidden rounded-xl bg-paper/15 lg:grid-cols-2">
        <div className="bg-ink p-6 sm:p-8">
          <h3 className="font-display text-lg font-bold text-paper">Where we earn</h3>
          <ul className="mt-5 space-y-3">
            {EARNS.map((e) => (
              <li key={e} className="flex gap-3 text-sm text-paper/80">
                <span aria-hidden="true" className="mt-[0.55em] h-px w-3 shrink-0 bg-coral" />
                {e}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-ink p-6 sm:p-8">
          <h3 className="font-display text-lg font-bold text-paper">Where we don&rsquo;t</h3>
          <ul className="mt-5 space-y-3">
            {DOESNT.map((e) => (
              <li key={e} className="flex gap-3 text-sm text-paper/55">
                <span aria-hidden="true" className="mt-[0.55em] h-px w-3 shrink-0 bg-paper/25" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
