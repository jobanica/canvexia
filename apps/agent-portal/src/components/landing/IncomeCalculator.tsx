"use client";

import { useState } from "react";
import { AGENT_OFFER, CALCULATOR, monthlyEarnings } from "@/lib/agentOffer";
import { pesoWhole } from "@/lib/money";
import { ApplyButton } from "./ApplyButton";

/**
 * "Magkano ang pwede mong kitain?" — a slider and three figures.
 *
 * A native range input, so it already works by touch, by keyboard and with a
 * screen reader; `aria-valuetext` is the only addition, so the number is read
 * as "5 clients" rather than a bare "5". The arithmetic lives in
 * `agentOffer.ts` with the rest of the offer.
 */
export function IncomeCalculator() {
  const [clients, setClients] = useState<number>(CALCULATOR.defaultClients);

  return (
    <div className="mt-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="clients-per-month" className="block text-sm font-medium text-slate-700">
          Bagong clients kada buwan
        </label>
        <p className="mt-1 font-mono text-3xl font-semibold text-slate-900" aria-hidden="true">
          {clients}
        </p>
        <input
          id="clients-per-month"
          type="range"
          min={CALCULATOR.minClients}
          max={CALCULATOR.maxClients}
          step={1}
          value={clients}
          onChange={(e) => setClients(Number(e.target.value))}
          aria-valuetext={`${clients} ${clients === 1 ? "client" : "clients"} kada buwan`}
          className="mt-3 h-6 w-full cursor-pointer accent-[#5b3fd6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3fd6] focus-visible:ring-offset-2"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500" aria-hidden="true">
          <span>{CALCULATOR.minClients}</span>
          <span>{CALCULATOR.maxClients}</span>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {CALCULATOR.months.map((m) => (
          <div key={m} className="rounded-2xl bg-[#efecfd] p-4 text-center">
            <dt className="text-sm text-slate-600">Buwan {m}</dt>
            <dd
              aria-live="polite"
              className="mt-1 font-mono text-3xl font-bold tracking-tight text-[#4a3aa3] sm:text-4xl"
            >
              {pesoWhole(monthlyEarnings(clients, m))}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-base text-slate-700">
        Kahit huminto ka sa pagbebenta, may pumapasok pa rin mula sa mga client na tuloy ang bayad.
      </p>

      <p className="mt-4 rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-600">
        Halimbawa lang ito, hindi garantiya ng kita. Naka-base ito sa clients na tuloy-tuloy na
        nagbabayad kada buwan. Ang aktwal mong kita ay depende sa dami ng client mo at kung gaano
        sila katagal mag-subscribe.
      </p>

      <ApplyButton position="calculator" className="mt-6 w-full" />
      <p className="sr-only">
        Ang commission ay {pesoWhole(AGENT_OFFER.activationCommission)} sa activation,{" "}
        {pesoWhole(AGENT_OFFER.tier1Amount)} kada buwan sa unang {AGENT_OFFER.tier1Months} na buwan,
        at {pesoWhole(AGENT_OFFER.tier2Amount)} kada buwan pagkatapos.
      </p>
    </div>
  );
}
