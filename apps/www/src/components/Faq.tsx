import { Section, SectionHead } from "./ui";
import { SITE } from "@/lib/site";

/**
 * Section 10.
 *
 * `<details>`, not a JavaScript accordion. It opens without hydration, it is
 * keyboard-accessible for free, it is searchable by the browser's find-in-page,
 * and on the phones this page is read on it is the fastest thing that could
 * possibly work. This is a server component for the same reason.
 *
 * The MLM answer is first because it is the question everyone in this audience
 * is actually holding.
 */
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is this MLM?",
    a: (
      <>
        No. There is no downline and no recruitment commission — you cannot earn a peso
        from signing up another partner, because there is no mechanism to. You earn{" "}
        {SITE.partnerShare}% of what the businesses in your city pay for software each
        month. If nobody in your city subscribes, nobody earns, including us.
      </>
    ),
  },
  {
    q: "Do I need to know software?",
    a: (
      <>
        No. You need to be able to demonstrate an app on a phone and explain what it
        does for a business. The onboarding programme covers the products; technical and
        product problems come to HQ, not to you.
      </>
    ),
  },
  {
    q: "What if someone else in my city applies?",
    a: (
      <>
        One partner per city. The waitlist is in order of application, but order is not
        the only thing we look at — we talk to people. Applying does not reserve a city
        and no fee is collected at this stage.
      </>
    ),
  },
  {
    q: "What if I don't hit the milestones?",
    a: (
      <>
        You lose exclusivity for the city, not the right to sell. Your existing merchants
        stay yours and keep paying you; what changes is that another partner may also
        work the city. The milestones are set at 6 and 12 months and you will know them
        before you sign anything.
      </>
    ),
  },
  {
    q: "Can I use my own brand name?",
    a: (
      <>
        Yes — that is the model. Your business name, your logo, your colors, your domain.
        Merchants sign up with you. Software namin, brand mo.
      </>
    ),
  },
  {
    q: "When does it launch?",
    a: (
      <>
        The partner system is being built now, which is why this is a waitlist and not an
        application form. Everyone on the list is contacted before applications open.
      </>
    ),
  },
  {
    q: "Do merchants pay me or CANVEXIA?",
    a: (
      <>
        Merchants are billed through the platform, and your {SITE.partnerShare}% is paid
        out to you monthly with a statement in the partner portal showing every merchant
        and what they paid. You see the same numbers we do.
      </>
    ),
  },
  {
    q: "Can I keep my job?",
    a: (
      <>
        Yes, and many partners will have to at the start. The first merchants take time
        and the income is not immediate — the form asks how many hours a week you can
        give this because the honest answer matters more than a big one.
      </>
    ),
  },
];

export function Faq() {
  return (
    <Section id="faq" tone="white" className="border-y border-line">
      <SectionHead eyebrow="FAQ" title="The eight questions everybody asks." />

      <div className="mt-10 max-w-readable divide-y divide-line border-y border-line">
        {FAQS.map((f) => (
          <details key={f.q} className="group py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-base font-bold marker:hidden">
              {f.q}
              <span
                aria-hidden="true"
                className="relative h-3 w-3 shrink-0 text-ink-faint transition-transform group-open:rotate-45"
              >
                <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-current" />
                <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-current" />
              </span>
            </summary>
            <p className="pb-5 text-sm leading-relaxed text-ink-soft">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
