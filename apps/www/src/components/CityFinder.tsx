"use client";

import { useMemo, useState } from "react";
import {
  quoteCity,
  searchTerritories,
  TIER_LABEL,
  type Territory,
} from "@/lib/territories";
import { peso } from "@/lib/earnings";
import { Badge } from "./ui";
import { useCity } from "./city-context";

/**
 * Type a city, see its tier and fee.
 *
 * The whole list is already on the page (it is reference data, ~143 rows,
 * server-rendered once), so the search runs in the browser: no endpoint, no
 * request per keystroke, and nothing to rate-limit. It also keeps working on a
 * bad connection, which on a phone in the provinces is most of them.
 *
 * "Join the [city] waitlist" writes the city into the shared context and jumps
 * to the form, so the applicant does not type their city twice.
 */
const STATUS_TEXT: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  taken: "Taken",
  hq: "HQ — model territory, not available",
};

export function CityFinder({ territories }: { territories: Territory[] }) {
  const [query, setQuery] = useState("");
  const { setCity } = useCity();

  const suggestions = useMemo(
    () => searchTerritories(territories, query),
    [territories, query],
  );
  const quote = useMemo(() => quoteCity(territories, query), [territories, query]);

  // An exact hit is already answered by the card below; showing it again in the
  // list under the box is just noise.
  const showList =
    suggestions.length > 0 &&
    !(suggestions.length === 1 && quote && !quote.unlisted && suggestions[0].name === quote.name);

  function join(city: string) {
    setCity(city);
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="rounded-xl border border-line bg-paper p-6 sm:p-8">
      <label htmlFor="city-finder" className="font-display text-lg font-bold">
        Find your city
      </label>
      <p className="mt-1 text-sm text-ink-soft">
        Type any city or municipality. If it isn&rsquo;t on our list yet, you can still
        apply — that is how we find out where to go next.
      </p>

      <input
        id="city-finder"
        type="text"
        autoComplete="address-level2"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. Tagum"
        className="mt-4 min-h-[52px] w-full rounded-lg border border-line bg-white px-4 text-base outline-none focus:border-ink"
      />

      {showList && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
          {suggestions.map((t) => (
            <li key={t.slug}>
              <button
                type="button"
                onClick={() => setQuery(t.name)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-paper"
              >
                <span>
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-ink-faint"> · {t.province}</span>
                </span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  {t.tier === "hq" ? "HQ" : peso(t.licenseFee)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {quote && (
        <div className="mt-5 rounded-lg border border-line bg-white p-5" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="font-display text-xl font-bold">{quote.name}</h4>
            <Badge tone={quote.closed ? "muted" : "accent"}>
              {STATUS_TEXT[quote.status] ?? quote.status}
            </Badge>
          </div>

          {quote.tier === "hq" ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Davao City is the model territory — CANVEXIA runs it directly. It is where
              the products are tested before any partner is asked to sell them.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-soft">
                {TIER_LABEL[quote.tier]} ·{" "}
                <strong className="font-semibold tabular-nums text-ink">
                  {peso(quote.licenseFee)}
                </strong>{" "}
                one-time licence
              </p>
              {quote.unlisted && (
                <p className="mt-2 text-sm text-ink-faint">
                  Not on our list yet, so it is quoted at the small-city fee. Apply and
                  we will confirm the tier with you before anything is agreed.
                </p>
              )}
              {quote.status === "reserved" && (
                <p className="mt-2 text-sm text-ink-faint">
                  Someone is already in conversation for this city. You can still apply —
                  reservations lapse.
                </p>
              )}
            </>
          )}

          {!quote.closed && (
            <button
              type="button"
              onClick={() => join(quote.name)}
              className="mt-5 inline-flex min-h-[48px] items-center rounded-lg bg-ink px-5 text-[0.95rem] font-semibold text-paper hover:bg-black"
            >
              Join the {quote.name} waitlist
            </button>
          )}
        </div>
      )}

      {territories.length === 0 && (
        // The list failed to load. Say so plainly rather than telling someone
        // their city does not exist.
        <p className="mt-4 text-sm text-ink-faint">
          Our city list isn&rsquo;t loading right now. Type your city into the form below
          and we will tell you the tier when we reply.
        </p>
      )}
    </div>
  );
}
