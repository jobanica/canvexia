import { TIER_FEE, type Tier, type Territory } from "@/lib/territories";
import { peso } from "@/lib/earnings";
import { Section, SectionHead } from "./ui";
import { CityFinder } from "./CityFinder";

/**
 * Section 6 — tiers, the finder, and the sentence that keeps this honest.
 *
 * The example cities are curated for recognisability but FILTERED against the
 * seeded list: move Digos from mid to large in the seed and it stops appearing
 * under ₱49,000 here instead of quietly contradicting the finder two hundred
 * pixels below. A hard-coded example that outlives its tier is the exact bug
 * this page cannot afford.
 */
const EXAMPLES: Record<Exclude<Tier, "hq">, string[]> = {
  large: ["Cebu City", "Quezon City", "Cagayan de Oro", "Iloilo City"],
  mid: ["Baguio", "Tagum", "Digos", "Dumaguete"],
  small: ["Mati", "Dipolog", "Tagbilaran", "Vigan"],
};

const WHAT_KIND: Record<Exclude<Tier, "hq">, string> = {
  large: "A highly urbanised city — dense, competitive, the most merchants.",
  mid: "A component or independent city with an established business district.",
  small: "A provincial city or a municipality with a real commercial strip.",
};

const TIER_NAME: Record<Exclude<Tier, "hq">, string> = {
  small: "Small city",
  mid: "Mid city",
  large: "Large city",
};

const INCLUDES = [
  "Exclusive territory",
  "Onboarding programme",
  "Marketing kit",
  "Partner portal access",
];

function examplesFor(all: Territory[], tier: Exclude<Tier, "hq">): string[] {
  if (all.length === 0) return EXAMPLES[tier];
  const inTier = new Set(all.filter((t) => t.tier === tier).map((t) => t.name));
  return EXAMPLES[tier].filter((name) => inTier.has(name));
}

export function Cities({ territories }: { territories: Territory[] }) {
  const tiers: Exclude<Tier, "hq">[] = ["small", "mid", "large"];

  return (
    <Section id="cities" tone="white" className="border-y border-line">
      <SectionHead
        eyebrow="Cities & fees"
        title="One licence, one city, one time."
        lead="The licence fee is paid once, for the city. There is no monthly fee to be a partner."
      />

      <div className="mt-12 grid gap-px overflow-hidden rounded-xl bg-line lg:grid-cols-3">
        {tiers.map((tier) => {
          const examples = examplesFor(territories, tier);
          return (
            <div key={tier} className="flex flex-col bg-white p-6 sm:p-7">
              <h3 className="font-display text-lg font-bold">{TIER_NAME[tier]}</h3>
              <p className="mt-2 font-display text-3xl font-bold tabular-nums">
                {peso(TIER_FEE[tier])}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-faint">
                One-time, per city
              </p>

              <p className="mt-5 text-sm leading-relaxed text-ink-soft">{WHAT_KIND[tier]}</p>

              {examples.length > 0 && (
                <p className="mt-4 text-sm text-ink-soft">
                  <span className="font-semibold text-ink">For example: </span>
                  {examples.join(", ")}.
                </p>
              )}

              <ul className="mt-6 space-y-2 border-t border-line pt-5 text-sm text-ink-soft">
                {INCLUDES.map((i) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[0.55em] h-px w-3 shrink-0 bg-coral" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-12">
        <CityFinder territories={territories} />
      </div>

      <div className="mt-12 max-w-readable border-l-2 border-coral pl-5">
        <p className="text-base leading-relaxed text-ink-soft">
          The fee buys exclusivity, onboarding, and your marketing kit.{" "}
          <strong className="font-semibold text-ink">It does not buy income.</strong>{" "}
          Exclusivity is kept by hitting minimum active-merchant milestones in your first
          6 and 12 months — a partner who doesn&rsquo;t work the city loses exclusivity,
          not the right to sell.
        </p>
      </div>
    </Section>
  );
}
