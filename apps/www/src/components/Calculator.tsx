"use client";

import { useMemo, useState } from "react";
import { earnings, peso } from "@/lib/earnings";
import { Section, SectionHead } from "./ui";
import { SITE } from "@/lib/site";

/**
 * Section 5. The math, with the 30% shown as plainly as the 70%.
 *
 * The arithmetic is in `lib/earnings.ts` and tested there — including the
 * brief's own check, 30 × ₱999 → ₱20,979. This file is the controls.
 *
 * The price box is an input rather than a second slider because a partner
 * setting their own price is a real decision and a slider makes it feel like a
 * dial. It has a floor and no ceiling: pricing above ₱999 is the partner's
 * business.
 */
const PRICE_FLOOR = 999;

export function Calculator() {
  const [merchants, setMerchants] = useState(30);
  const [priceText, setPriceText] = useState(String(PRICE_FLOOR));

  const price = Math.max(PRICE_FLOOR, Number(priceText.replace(/[^\d]/g, "")) || 0);
  const e = useMemo(() => earnings(merchants, price), [merchants, price]);

  return (
    <Section id="math">
      <SectionHead
        eyebrow="The math"
        title="What the numbers look like."
        lead="Move the slider. Nothing here is a projection — it is multiplication, and you can check it."
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div className="space-y-8">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor="merchants" className="text-sm font-semibold">
                Paying merchants
              </label>
              <output
                htmlFor="merchants"
                className="font-display text-2xl font-bold tabular-nums"
              >
                {e.merchants}
              </output>
            </div>
            <input
              id="merchants"
              type="range"
              min={5}
              max={100}
              step={1}
              value={merchants}
              onChange={(ev) => setMerchants(Number(ev.target.value))}
              className="mt-3 h-11 w-full cursor-pointer accent-coral"
            />
            <div className="flex justify-between text-xs text-ink-faint">
              <span>5</span>
              <span>100</span>
            </div>
          </div>

          <div>
            <label htmlFor="price" className="text-sm font-semibold">
              Monthly price you charge a merchant
            </label>
            <div className="mt-3 flex items-center rounded-lg border border-line bg-white focus-within:border-ink">
              <span className="pl-4 text-ink-faint">₱</span>
              <input
                id="price"
                type="text"
                inputMode="numeric"
                value={priceText}
                onChange={(ev) => setPriceText(ev.target.value)}
                onBlur={() => setPriceText(String(price))}
                className="min-h-[48px] w-full bg-transparent px-2 font-display text-lg font-bold tabular-nums outline-none"
              />
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              Minimum {peso(PRICE_FLOOR)} a month. You can charge more.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-white p-6 sm:p-8">
          <p className="text-sm font-semibold text-ink-soft">Your share, per month</p>
          <p className="mt-1 font-display text-4xl font-bold tabular-nums sm:text-5xl">
            {peso(e.partnerMonthly)}
          </p>

          <dl className="mt-8 divide-y divide-line border-y border-line text-sm">
            <div className="flex justify-between py-3">
              <dt className="text-ink-soft">Merchants pay, total</dt>
              <dd className="font-semibold tabular-nums">{peso(e.grossMonthly)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-ink-soft">You keep ({SITE.partnerShare}%)</dt>
              <dd className="font-semibold tabular-nums">{peso(e.partnerMonthly)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-ink-soft">CANVEXIA keeps ({SITE.hqShare}%)</dt>
              <dd className="font-semibold tabular-nums">{peso(e.hqMonthly)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-ink-soft">Your share, per year</dt>
              <dd className="font-semibold tabular-nums">{peso(e.partnerYearly)}</dd>
            </div>
          </dl>

          <p className="mt-6 text-sm leading-relaxed text-ink-soft">
            At {e.merchants} merchants you&rsquo;d earn{" "}
            <strong className="font-semibold text-ink">{peso(e.partnerMonthly)}</strong> a
            month. Reaching {e.merchants} typically means visiting{" "}
            <strong className="font-semibold text-ink">{e.visitsImplied}</strong> businesses.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            The 3× is an illustration of effort, not a conversion rate anybody measured.
            Merchants who cancel stop paying, and so do you.
          </p>
        </div>
      </div>
    </Section>
  );
}
