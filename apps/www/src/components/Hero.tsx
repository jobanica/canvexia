import { Container, Cta, Eyebrow, IconTile } from "./ui";
import { ScreenFrame } from "./ScreenFrame";
import { IconBox, IconPin, IconRepeat } from "./Icons";
import { SITE } from "@/lib/site";

/**
 * Section 1, in the reference layout: copy left, a dark circular field on the
 * right with the product screens floating over it, three proof chips beneath.
 *
 * The circle is a CSS shape rather than an image — nothing to download, and it
 * crops itself on a phone instead of forcing a horizontal scrollbar. It is
 * `overflow-hidden` on the section so the part that bleeds past the container
 * never widens the page, which is the failure this layout invites.
 */
const CHIPS = [
  { icon: <IconPin size={20} />, title: "Exclusive territory", line: "One partner per city." },
  { icon: <IconRepeat size={20} />, title: "70% recurring", line: "Every month, not once." },
  { icon: <IconBox size={20} />, title: "No inventory", line: "Nothing to buy or store." },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line bg-paper">
      {/* The dotted margin from the reference. Decorative, so it is hidden from
          assistive tech and from small screens where it would crowd the copy. */}
      <span
        aria-hidden="true"
        className="dot-grid absolute right-6 top-28 hidden h-28 w-28 text-ink/15 lg:block"
      />

      <Container className="relative grid gap-12 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
        <div>
          <Eyebrow>Partner programme</Eyebrow>

          <h1 className="mt-5 font-display text-[2.05rem] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[2.7rem] lg:text-[3.1rem]">
            One city. One partner.
            <br />
            Your brand, <span className="accent-text">our software.</span>
          </h1>

          <p className="mt-5 max-w-readable border-l-2 border-coral/40 pl-4 text-[0.95rem] leading-relaxed text-ink-soft">
            CANVEXIA builds software for Philippine local businesses — restaurants,
            pharmacies, print shops, laundries. You sell it in your city under your own
            name and keep {SITE.partnerShare}% of every monthly subscription. Walang
            inventory. Walang tindahan. Totoong trabaho.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Cta href="#waitlist" arrow>
              Join the waitlist for your city
            </Cta>
            {SITE.bookingUrl && (
              <Cta href={SITE.bookingUrl} variant="outline" external>
                Book a call
              </Cta>
            )}
          </div>

          <p className="mt-6 max-w-readable text-sm leading-relaxed text-ink-faint">
            Applications open when the partner system launches. No fee to join the
            waitlist. Calls are for people who already know their city.
          </p>

          <ul className="mt-9 grid gap-5 border-t border-line pt-7 sm:grid-cols-3">
            {CHIPS.map((c) => (
              <li key={c.title} className="flex items-start gap-3">
                <IconTile size="sm" tone="coral">
                  {c.icon}
                </IconTile>
                <span>
                  <span className="block text-sm font-bold leading-tight">{c.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">{c.line}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/*
          min-w-0 is load-bearing: a grid column defaults to min-content width,
          and without it the frames push the column wider than its track and the
          circle follows them straight across the paragraph on the left. That is
          exactly what the first cut of this did.
        */}
        <div className="relative min-w-0">
          {/* The dark field, sized to the column it lives in rather than to a
              percentage that can grow past it. aspect-square keeps it round. */}
          <span
            aria-hidden="true"
            className="absolute right-[-10%] top-1/2 hidden aspect-square w-[104%] max-w-[520px] -translate-y-1/2 rounded-full bg-midnight sm:block"
          />
          <span
            aria-hidden="true"
            className="accent-gradient absolute -top-4 right-2 hidden h-24 w-24 rounded-full opacity-70 blur-3xl sm:block"
          />

          {/*
            No captions on these. The overlap is the point of the layout, and a
            frame that carries its own caption has it covered by whatever
            overlaps it; moved below the pair, the line landed on the dark
            circle instead. The frames say YOURBRAND and the headline beside
            them says "Your brand, our software" — the words were redundant.
          */}
          <div className="relative mx-auto max-w-[400px] pb-10 lg:ml-auto lg:mr-0">
            <ScreenFrame brand="YourBrand" className="w-full" />
            <ScreenFrame
              brand="YourBrand"
              className="absolute -bottom-2 -left-10 hidden w-[46%] sm:block"
            />
          </div>

        </div>
      </Container>
    </section>
  );
}
