import { Section } from "./ui";

/**
 * Section 8.
 *
 * NO PHOTO — asked for and answered ("no need founder photo"). NO SOCIAL LINKS
 * either: the brief left `[handles]` for someone to fill and they have not
 * been, and a link to a guessed account is worse than no link. Both are one
 * edit away; nothing else depends on this file.
 *
 * NO MERCHANT COUNT. Servd's Davao numbers belong to servdph.com, a different
 * business on a different database (D31). "Runs it himself" is the claim this
 * company can stand behind.
 */
export function Founder() {
  return (
    <Section tone="white" className="border-y border-line">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <span className="rule-accent" aria-hidden="true" />
          <h2 className="mt-5 font-display text-[1.7rem] font-bold leading-tight sm:text-4xl">
            The person behind this
          </h2>
        </div>

        <div className="max-w-readable">
          <p className="font-display text-xl font-bold">Jobani — Davao City</p>
          <div className="mt-4 space-y-4 text-base leading-relaxed text-ink-soft">
            <p>
              CANVEXIA started with one product and one city. Servd — restaurant ordering
              and management — was built here in Davao, and the first merchants were
              signed the same way a partner will sign theirs: walking in, asking for the
              owner, showing the thing on a phone.
            </p>
            <p>
              Davao City is the model territory. It is not for sale, and that is the
              point: whatever a partner is asked to do in their city is being done here
              first, by the person asking.
            </p>
            <p>
              The partner programme exists because one operator cannot cover the country
              and a call centre cannot sell to a carinderia. The people who can are
              already in those cities.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
