import Link from "next/link";
import { AGENT_OFFER, FIRST_SIX_MONTHS_PER_CLIENT } from "@/lib/agentOffer";
import { pesoWhole } from "@/lib/money";
import { Icon, type IconName } from "../icons";
import { ApplyButton } from "./ApplyButton";
import { HeroVideo } from "./HeroVideo";
import { IncomeCalculator } from "./IncomeCalculator";
import { HERO_SENTINEL_ID, StickyApply } from "./StickyApply";

const O = AGENT_OFFER;

export const CONTACT_EMAIL = "hirestaff25@gmail.com";
export const CONTACT_MOBILE = "09762097075";
const CONTACT_MOBILE_READABLE = "0976 209 7075";

// Three ways you earn — the feature cards, as in the reference design but with
// our real commission figures instead of invented numbers.
const EARNINGS: { amount: string; when: string; detail: string; icon: IconName }[] = [
  { amount: pesoWhole(O.activationCommission), when: "on activation", detail: "The client's full activation fee is yours.", icon: "peso" },
  { amount: pesoWhole(O.tier1Amount), when: "per month", detail: `For the first ${O.tier1Months} months the client pays.`, icon: "wallet" },
  { amount: pesoWhole(O.tier2Amount), when: "per month", detail: `From month ${O.tier1Months + 1} onward, while the client stays active.`, icon: "chart" },
];

// The stat tiles in the split section. In the reference these are fabricated
// social proof ("10K+ works", "4.9 rating"); here they are the real offer.
const STATS: { value: string; label: string }[] = [
  { value: pesoWhole(O.activationCommission), label: "per activation" },
  { value: `${pesoWhole(O.tier1Amount)}/mo`, label: `first ${O.tier1Months} months` },
  { value: pesoWhole(FIRST_SIX_MONTHS_PER_CLIENT), label: "one client, first 6 months" },
  { value: `Day ${O.payoutDayOfMonth}`, label: "payout each month" },
];

const PRODUCTS = [
  { name: "Servd", detail: "For restaurants, cafes, and any food business, including online food sellers. Ordering and management in one place.", icon: "store" as const },
  { name: "Reseta", detail: "An all-in-one POS for pharmacies.", icon: "box" as const },
  { name: "Coming soon", detail: "Software for laundry, car wash, and printing businesses.", icon: "bolt" as const },
];

const STEPS = [
  "Apply online. Enter your name, mobile number, and GCash or bank details.",
  "Get your link and QR. Once approved, you have your own referral link and QR code.",
  "Refer a business. The owner signs up with your link, and it's recorded under your name right away.",
  "Get paid. Every month, straight to your GCash or bank account.",
];

const BENEFITS = [
  ["Your own dashboard.", "See every client, whether they've paid, and how much commission you've earned."],
  ["You don't collect payments.", "Clients pay the company directly. You just refer."],
  ["Clear records.", "Every commission ties to a client and a month, with payout history and reference numbers."],
  ["Ready-to-use materials.", "A link, QR code, and product info you can share."],
];

const FOR_YOU = [
  "You know someone who owns a restaurant, cafe, or pharmacy",
  "You want a sideline that needs no capital",
  "You're comfortable talking to people, online or in person",
  "You want income that continues even after the sale",
];

const FAQ = [
  ["Is there a fee to apply?", "No. The application is free and there's nothing to buy."],
  ["Do I need sales experience?", "No. We give you product info and materials. You just need to be able to talk to a business owner."],
  ["When do I get paid?", `On the ${O.payoutDayOfMonth}th of each month, for client payments confirmed the previous month. The minimum payout is ${pesoWhole(O.payoutMinimum)}.`],
  ["What if my client stops paying?", "Your commission for that client pauses too. If they come back, they're still recorded under you."],
  ["Do I collect the payment?", "No. Clients pay the company directly. Never accept cash from a client."],
  ["Can I do this part-time?", "Yes. Your hours are up to you."],
  ["How can I be sure my earnings are correct?", "Your dashboard shows every client, every payment, and every commission. You can also download your monthly statement."],
];

const sectionClass = "px-4 py-12 sm:py-16";
const innerClass = "mx-auto max-w-6xl";
const eyebrowClass = "text-xs font-semibold uppercase tracking-[0.18em] text-[#6c5dbe]";
const h2Class = "mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-4xl";

// The feature cards alternate fills, like the reference: tinted, solid, dark.
const CARD_FILLS = [
  "bg-[#efecfd] text-slate-900",
  "bg-gradient-to-br from-[#7c5cf5] to-[#5b3fd6] text-white",
  "bg-[#211b3b] text-white",
];

/**
 * The public face of the agent program: one page, one action.
 *
 * Shown at `/` to anyone not signed in; agents and staff land on their
 * dashboards instead. A consulting-agency layout in the CANVEXIA violet — a
 * dark hero with the explainer video, feature cards, the income calculator,
 * and the rest — but every button still goes to `/apply`, and the only other
 * link is the sign-in one. Phone first; most visitors arrive from Facebook.
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f4f2fb] pb-24 text-slate-900 sm:pb-0">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4">
        <span className="text-lg font-bold tracking-tight text-[#4a3aa3]">Canvexia</span>
        <nav className="ml-6 hidden items-center gap-6 text-sm text-slate-600 md:flex">
          <a href="#earnings" className="hover:text-slate-900">Earnings</a>
          <a href="#products" className="hover:text-slate-900">Products</a>
          <a href="#how" className="hover:text-slate-900">How it works</a>
          <a href="#faq" className="hover:text-slate-900">FAQ</a>
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="rounded-lg px-2 py-1 text-sm text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3fd6]"
          >
            Agent login
          </Link>
          <ApplyButton position="header" className="px-4 py-2 text-sm">Apply</ApplyButton>
        </div>
      </header>

      <main>
        {/* 1. Hero — dark violet, headline + video */}
        <section className="px-4 pt-2">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#1a1630] bg-[radial-gradient(ellipse_at_top_right,_#3a2d6e_0%,_#1a1630_55%)] px-5 py-10 text-white sm:px-10 sm:py-14">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[#c9bbff] ring-1 ring-white/15">
                  <Icon name="star" className="h-3.5 w-3.5" />
                  Canvexia Agent Program
                </span>
                <h1 className="mt-4 text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                  Earn every month from every business <span className="text-[#a78bfa]">you refer.</span>
                </h1>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
                  Offer Servd to restaurants and Reseta to pharmacies. {pesoWhole(O.activationCommission)} on every
                  activation, plus up to {pesoWhole(O.tier1Amount)} a month for as long as your client keeps paying.
                </p>
                <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <ApplyButton position="hero" className="w-full sm:w-auto" />
                  <a href={`tel:+63${CONTACT_MOBILE.slice(1)}`} className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15">
                      <Icon name="phone" className="h-5 w-5" />
                    </span>
                    <span className="text-sm leading-tight">
                      <span className="block text-white/50">Questions?</span>
                      <span className="font-semibold text-white">{CONTACT_MOBILE_READABLE}</span>
                    </span>
                  </a>
                </div>
                <p className="mt-5 text-sm text-white/50">Free to apply · No capital · No inventory</p>
              </div>

              <div className="relative">
                <HeroVideo />
                <span className="absolute -right-3 -top-3 hidden rounded-xl bg-white px-4 py-3 text-slate-900 shadow-lg sm:block">
                  <span className="block font-mono text-xl font-bold text-[#4a3aa3]">{pesoWhole(O.activationCommission)}</span>
                  <span className="block text-xs text-slate-500">per activation</span>
                </span>
              </div>
            </div>
          </div>
        </section>
        <div id={HERO_SENTINEL_ID} aria-hidden="true" />

        {/* 2. Features — three ways you earn */}
        <section id="earnings" className={sectionClass}>
          <div className={innerClass}>
            <p className={eyebrowClass}>What you earn</p>
            <h2 className={h2Class}>You earn three ways from one client.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {EARNINGS.map((e, i) => (
                <div key={e.detail} className={`rounded-2xl p-6 ${CARD_FILLS[i]}`}>
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${i === 0 ? "bg-white text-[#5b3fd6]" : "bg-white/15 text-white"}`}>
                    <Icon name={e.icon} className="h-5 w-5" />
                  </span>
                  <p className="mt-5 font-mono text-4xl font-bold tracking-tight">{e.amount}</p>
                  <p className={`mt-1 text-sm font-medium ${i === 0 ? "text-slate-500" : "text-white/70"}`}>{e.when}</p>
                  <p className={`mt-3 text-sm leading-relaxed ${i === 0 ? "text-slate-600" : "text-white/70"}`}>{e.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-base leading-relaxed text-slate-700">
              One client alone is {pesoWhole(FIRST_SIX_MONTHS_PER_CLIENT)} in the first {O.tier1Months} months. Then{" "}
              {pesoWhole(O.tier2Amount)} a month keeps coming.
            </p>
          </div>
        </section>

        {/* 3. Split — why, with the real offer as stat tiles */}
        <section className={sectionClass}>
          <div className={`${innerClass} grid items-center gap-10 lg:grid-cols-2`}>
            <div className="rounded-3xl bg-[#211b3b] bg-[radial-gradient(ellipse_at_bottom_left,_#3a2d6e_0%,_#211b3b_60%)] p-6 sm:p-8">
              <div className="grid grid-cols-2 gap-4">
                {STATS.map((s) => (
                  <div key={s.label} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                    <p className="font-mono text-2xl font-bold text-white sm:text-3xl">{s.value}</p>
                    <p className="mt-1 text-xs text-white/60">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className={eyebrowClass}>Why Canvexia</p>
              <h2 className={h2Class}>You never have to guess what you&apos;ve earned.</h2>
              <ul className="mt-6 space-y-4">
                {BENEFITS.map(([title, detail]) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#efecfd] text-[#5b3fd6]">
                      <Icon name="check" className="h-4 w-4" />
                    </span>
                    <span className="text-sm leading-relaxed text-slate-700">
                      <span className="font-semibold text-slate-900">{title}</span> {detail}
                    </span>
                  </li>
                ))}
              </ul>
              <ApplyButton position="final" className="mt-7 w-full sm:w-auto" />
            </div>
          </div>
        </section>

        {/* 4. Income calculator */}
        <section className={sectionClass}>
          <div className={`${innerClass} rounded-3xl bg-white p-6 shadow-sm sm:p-10`}>
            <p className={eyebrowClass}>Calculate</p>
            <h2 className={h2Class}>How much could you earn?</h2>
            <p className="mt-2 text-base text-slate-700">Choose how many new clients you can sign up each month.</p>
            <div className="mx-auto max-w-2xl">
              <IncomeCalculator />
            </div>
          </div>
        </section>

        {/* 5. Products */}
        <section id="products" className={sectionClass}>
          <div className={innerClass}>
            <p className={eyebrowClass}>What you&apos;ll offer</p>
            <h2 className={h2Class}>Two products today. More coming.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {PRODUCTS.map((p) => (
                <div key={p.name} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#efecfd] text-[#5b3fd6]">
                    <Icon name={p.icon} className="h-5 w-5" />
                  </span>
                  <p className="mt-5 text-lg font-semibold text-slate-900">{p.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-base leading-relaxed text-slate-700">
              One agent code works across every product. The client pays just {pesoWhole(O.customerActivationFee)} activation
              and {pesoWhole(O.customerMonthlyFee)} a month.
            </p>
          </div>
        </section>

        {/* 6. How it works */}
        <section id="how" className={sectionClass}>
          <div className={innerClass}>
            <p className={eyebrowClass}>How it works</p>
            <h2 className={h2Class}>Just four steps.</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {STEPS.map((step, i) => (
                <div key={step} className="flex gap-4 rounded-2xl bg-white p-5">
                  <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7c5cf5] to-[#5b3fd6] font-mono text-base font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="pt-1.5 text-sm leading-relaxed text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Who this is for */}
        <section className={sectionClass}>
          <div className={`${innerClass} rounded-3xl bg-[#efecfd] p-6 sm:p-10`}>
            <p className={eyebrowClass}>Who it&apos;s for</p>
            <h2 className={h2Class}>This is for you if:</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {FOR_YOU.map((line) => (
                <li key={line} className="flex gap-3 rounded-xl bg-white/70 p-4 text-sm leading-relaxed text-slate-700">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#5b3fd6] text-white">
                    <Icon name="check" className="h-3 w-3" />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 8. FAQ */}
        <section id="faq" className={sectionClass}>
          <div className={`${innerClass} max-w-3xl`}>
            <p className={eyebrowClass}>Questions</p>
            <h2 className={h2Class}>FAQ</h2>
            <div className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-5 font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b3fd6]">
                    {q}
                    <span aria-hidden="true" className="ml-auto shrink-0 text-xl leading-none text-slate-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="px-5 pb-5 text-base leading-relaxed text-slate-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 9. Final CTA */}
        <section className="px-4 pb-14">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#1a1630] bg-[radial-gradient(ellipse_at_top,_#3a2d6e_0%,_#1a1630_60%)] px-5 py-12 text-center text-white sm:px-10 sm:py-16">
            <h2 className="text-2xl font-bold tracking-tight sm:text-4xl">Start with one client.</h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-white/70">
              Just one restaurant or pharmacy you know, and you&apos;ve got {pesoWhole(O.activationCommission)} plus monthly income.
            </p>
            <div className="mt-7 flex justify-center">
              <ApplyButton position="final" />
            </div>
            <p className="mt-3 text-sm text-white/50">The application form is short.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 px-4 py-8">
        <div className={`${innerClass} flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600`}>
          <span>Canvexia Technologies</span>
          <span aria-hidden="true">·</span>
          <Link href="/login" className="underline underline-offset-4 hover:text-slate-900">Agent login</Link>
          <span aria-hidden="true">·</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-slate-900">Contact</a>
          <span aria-hidden="true">·</span>
          <a href={`tel:+63${CONTACT_MOBILE.slice(1)}`} className="underline underline-offset-4 hover:text-slate-900">{CONTACT_MOBILE_READABLE}</a>
        </div>
      </footer>

      <StickyApply />
    </div>
  );
}
