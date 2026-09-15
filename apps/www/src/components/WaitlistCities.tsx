import { quoteCity, TIER_LABEL, type Territory } from "@/lib/territories";
import { peso } from "@/lib/earnings";
import { Badge, Section, SectionHead } from "./ui";
import type { WaitlistCity } from "@/server/territories";

/**
 * Section 9 — which cities people have asked for.
 *
 * COUNTS ONLY. The table behind this is full of strangers' names, emails and
 * mobile numbers, and this is a public page; the query that feeds it selects a
 * city and a number and nothing else.
 *
 * The tier shown comes from the seeded list, so a city nobody has classified
 * appears without a fee rather than with a guessed one.
 */
export function WaitlistCities({
  cities,
  territories,
}: {
  cities: WaitlistCity[];
  territories: Territory[];
}) {
  return (
    <Section>
      <SectionHead
        centered
        eyebrow="On the waitlist"
        title="Where people have already asked."
        lead="Applications are not open yet. This is who has raised their hand."
      />

      {cities.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="font-display text-xl font-bold">Be the first in your city.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Nobody has applied yet. The list starts below.
          </p>
        </div>
      ) : (
        <ul className="mt-10 grid gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((c) => {
            const quote = quoteCity(territories, c.city);
            return (
              <li key={c.city} className="flex items-center justify-between gap-4 bg-white px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.city}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {quote && !quote.unlisted
                      ? `${TIER_LABEL[quote.tier]}${quote.tier === "hq" ? "" : ` · ${peso(quote.licenseFee)}`}`
                      : "Tier to be confirmed"}
                  </p>
                </div>
                <Badge tone="neutral">
                  {c.applicants} {c.applicants === 1 ? "applicant" : "applicants"}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
