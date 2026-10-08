import Link from "next/link";
import { AGENT_OFFER, FIRST_SIX_MONTHS_PER_CLIENT } from "@/lib/agentOffer";
import { pesoWhole } from "@/lib/money";
import { ApplyButton } from "./ApplyButton";
import { IncomeCalculator } from "./IncomeCalculator";
import { HERO_SENTINEL_ID, StickyApply } from "./StickyApply";

const O = AGENT_OFFER;

export const CONTACT_EMAIL = "hirestaff25@gmail.com";
export const CONTACT_MOBILE = "09762097075";
const CONTACT_MOBILE_READABLE = "0976 209 7075";

const EARNINGS = [
  {
    amount: pesoWhole(O.activationCommission),
    when: "sa activation",
    detail: "Sa iyo ang buong activation fee ng client.",
  },
  {
    amount: pesoWhole(O.tier1Amount),
    when: "kada buwan",
    detail: `Sa unang ${O.tier1Months} na buwan na nagbabayad ang client.`,
  },
  {
    amount: pesoWhole(O.tier2Amount),
    when: "kada buwan",
    detail: `Mula sa ika-${O.tier1Months + 1} buwan, habang active pa ang client.`,
  },
];

const PRODUCTS = [
  {
    name: "Servd",
    detail:
      "Para sa mga restaurant, cafe, at kahit anong food business, pati online food sellers. Ordering at management system sa iisang lugar.",
  },
  { name: "Reseta", detail: "All-in-one POS para sa mga pharmacy." },
  { name: "Paparating", detail: "Laundry, car wash, at printing business software." },
];

const STEPS = [
  "Mag-apply online. Ilagay ang pangalan, mobile number, at GCash o bank details mo.",
  "Kunin ang link at QR mo. Pagka-approve, may sarili kang referral link at QR code.",
  "I-refer ang negosyo. Mag-sign up ang may-ari gamit ang link mo. Naka-record agad sa pangalan mo.",
  "Tanggapin ang bayad mo. Buwan-buwan, diretso sa GCash o bank account mo.",
];

const BENEFITS = [
  ["Sariling dashboard.", "Kita mo ang bawat client, kung bayad na sila, at magkano ang commission mo."],
  ["Hindi ikaw ang maniningil.", "Diretso sa company ang bayad ng client. Ikaw, magbenta lang."],
  ["Malinaw na record.", "Bawat commission may katumbas na client at buwan. May payout history at reference number."],
  ["Handang gamitin na materials.", "Link, QR code, at product info na pwede mong i-share."],
];

const FOR_YOU = [
  "May kakilala kang may-ari ng restaurant, cafe, o pharmacy",
  "Gusto mo ng sideline na hindi kailangan ng puhunan",
  "Sanay kang makipag-usap sa tao, online man o harapan",
  "Gusto mo ng kita na tumutuloy kahit tapos na ang benta",
];

const FAQ = [
  ["May bayad ba mag-apply?", "Wala. Libre ang application at wala kang bibilhin."],
  [
    "Kailangan ko ba ng experience sa sales?",
    "Hindi. Bibigyan ka namin ng product info at materials. Ang kailangan lang, marunong kang makipag-usap sa may-ari ng negosyo.",
  ],
  [
    "Kailan ako mababayaran?",
    `Tuwing ika-${O.payoutDayOfMonth} ng buwan, para sa mga bayad ng client na na-confirm noong nakaraang buwan. Minimum payout ay ${pesoWhole(O.payoutMinimum)}.`,
  ],
  [
    "Paano kung huminto sa pagbabayad ang client ko?",
    "Hihinto rin ang commission mo sa client na iyon. Kapag bumalik sila, sa iyo pa rin sila naka-record.",
  ],
  [
    "Ako ba ang kokolekta ng bayad?",
    "Hindi. Diretso sa company ang bayad ng client. Huwag tumanggap ng cash mula sa client.",
  ],
  ["Pwede ba ito kahit part-time?", "Oo. Ikaw ang bahala sa oras mo."],
  [
    "Paano ko masisiguro na tama ang bilang ng kita ko?",
    "Sa dashboard mo, makikita mo ang bawat client, bawat bayad, at bawat commission. Pwede mo ring i-download ang monthly statement mo.",
  ],
];

const sectionClass = "px-4 py-10 sm:py-14";
const innerClass = "mx-auto max-w-2xl";
const h2Class = "text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl";

/**
 * The public face of the agent program: one page, one action.
 *
 * Shown at `/` to anyone not signed in. Every button goes to `/apply`; the only
 * other link is the sign-in one in the header, for agents who already applied.
 * Phone first — most visitors arrive from a Facebook post or a Messenger link.
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-white pb-24 text-slate-900 sm:pb-0">
      <header className="flex items-center gap-3 px-4 py-4">
        <span className="text-lg font-bold tracking-tight text-[#4a3aa3]">Canvexia</span>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg px-2 py-1 text-sm text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3fd6]"
          >
            Agent login
          </Link>
          <ApplyButton position="header" className="px-4 py-2 text-sm">
            Mag-apply
          </ApplyButton>
        </div>
      </header>

      <main>
        {/* 1. Hero */}
        <section className="px-4 pb-10 pt-6 sm:pb-14 sm:pt-10">
          <div className={innerClass}>
            <p className="text-sm font-medium uppercase tracking-wide text-[#5b3fd6]">
              Canvexia Agent Program
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Kumita buwan-buwan sa bawat negosyong ma-refer mo.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-700 sm:text-lg">
              I-alok ang Servd sa mga restaurant at Reseta sa mga pharmacy.{" "}
              {pesoWhole(O.activationCommission)} agad sa bawat activation, plus hanggang{" "}
              {pesoWhole(O.tier1Amount)} kada buwan habang nagbabayad ang client mo.
            </p>
            <ApplyButton position="hero" className="mt-7 w-full sm:w-auto" />
            <p className="mt-3 text-sm text-slate-600">
              Libre mag-apply. Walang puhunan. Walang inventory.
            </p>
          </div>
        </section>
        <div id={HERO_SENTINEL_ID} aria-hidden="true" />

        {/* 2. What you earn per client */}
        <section className={`${sectionClass} bg-slate-50`}>
          <div className={innerClass}>
            <h2 className={h2Class}>Tatlong beses kang kikita sa isang client.</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {EARNINGS.map((e) => (
                <li key={e.detail} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="font-mono text-4xl font-bold tracking-tight text-[#4a3aa3]">{e.amount}</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{e.when}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{e.detail}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-base leading-relaxed text-slate-700">
              Isang client lang, {pesoWhole(FIRST_SIX_MONTHS_PER_CLIENT)} na sa unang{" "}
              {O.tier1Months} na buwan. Tapos tuloy pa ang {pesoWhole(O.tier2Amount)} kada buwan.
            </p>
          </div>
        </section>

        {/* 3. Income calculator */}
        <section className={sectionClass}>
          <div className={innerClass}>
            <h2 className={h2Class}>Magkano ang pwede mong kitain?</h2>
            <p className="mt-2 text-base text-slate-700">
              Piliin kung ilang bagong client ang kaya mong makuha kada buwan.
            </p>
            <IncomeCalculator />
          </div>
        </section>

        {/* 4. What you will sell */}
        <section className={`${sectionClass} bg-slate-50`}>
          <div className={innerClass}>
            <h2 className={h2Class}>Dalawang produkto ngayon. Dadami pa.</h2>
            <ul className="mt-6 space-y-3">
              {PRODUCTS.map((p) => (
                <li key={p.name} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-lg font-semibold text-slate-900">{p.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.detail}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-base leading-relaxed text-slate-700">
              Isang agent code lang, gamit mo sa lahat ng produkto.{" "}
              {pesoWhole(O.customerActivationFee)} activation at {pesoWhole(O.customerMonthlyFee)} kada
              buwan lang ang bayad ng client.
            </p>
          </div>
        </section>

        {/* 5. How it works */}
        <section className={sectionClass}>
          <div className={innerClass}>
            <h2 className={h2Class}>Apat na hakbang lang.</h2>
            <ol className="mt-6 space-y-4">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#efecfd] font-mono text-base font-bold text-[#4a3aa3]"
                  >
                    {i + 1}
                  </span>
                  <p className="pt-1 text-base leading-relaxed text-slate-700">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 6. What you get as an agent */}
        <section className={`${sectionClass} bg-slate-50`}>
          <div className={innerClass}>
            <h2 className={h2Class}>Hindi mo kailangang manghula kung magkano na ang kita mo.</h2>
            <ul className="mt-6 space-y-3">
              {BENEFITS.map(([title, detail]) => (
                <li key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="font-semibold text-slate-900">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 7. Who this is for */}
        <section className={sectionClass}>
          <div className={innerClass}>
            <h2 className={h2Class}>Para sa iyo ito kung:</h2>
            <ul className="mt-6 space-y-3">
              {FOR_YOU.map((line) => (
                <li key={line} className="flex gap-3 text-base leading-relaxed text-slate-700">
                  <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#5b3fd6]" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 8. FAQ */}
        <section className={`${sectionClass} bg-slate-50`}>
          <div className={innerClass}>
            <h2 className={h2Class}>FAQ</h2>
            <div className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-5 font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b3fd6]">
                    {q}
                    <span
                      aria-hidden="true"
                      className="ml-auto shrink-0 text-xl leading-none text-slate-400 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-base leading-relaxed text-slate-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 9. Final call to action */}
        <section className={sectionClass}>
          <div className={innerClass}>
            <h2 className={h2Class}>Magsimula sa isang client.</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-700">
              Isang restaurant o pharmacy lang na kakilala mo, may {pesoWhole(O.activationCommission)}{" "}
              ka na at buwan-buwang kita.
            </p>
            <ApplyButton position="final" className="mt-7 w-full sm:w-auto" />
            <p className="mt-3 text-sm text-slate-600">Maikli lang ang application form.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 px-4 py-8">
        <div className={`${innerClass} flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600`}>
          <span>Canvexia Technologies</span>
          <span aria-hidden="true">·</span>
          <Link href="/login" className="underline underline-offset-4 hover:text-slate-900">
            Agent login
          </Link>
          <span aria-hidden="true">·</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-slate-900">
            Contact
          </a>
          <span aria-hidden="true">·</span>
          <a href={`tel:+63${CONTACT_MOBILE.slice(1)}`} className="underline underline-offset-4 hover:text-slate-900">
            {CONTACT_MOBILE_READABLE}
          </a>
        </div>
      </footer>

      <StickyApply />
    </div>
  );
}
