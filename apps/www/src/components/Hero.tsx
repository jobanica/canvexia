import { Container, Cta } from "./ui";
import { ScreenFrame } from "./ScreenFrame";
import { SITE } from "@/lib/site";

/**
 * Section 1.
 *
 * English headline, Taglish in the body where it lands — the answer given when
 * the D-table asked. The line under the buttons is the most important small
 * text on the page: it says applications are not open, before anyone types
 * anything.
 */
export function Hero() {
  return (
    <section className="border-b border-line bg-paper">
      <Container className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div>
          <span className="rule-accent" aria-hidden="true" />
          <h1 className="mt-6 font-display text-[2.35rem] font-bold leading-[1.04] tracking-[-0.025em] sm:text-5xl lg:text-[3.75rem]">
            One city. One partner.
            <br />
            Your brand, our software.
          </h1>

          <p className="mt-6 max-w-readable text-base leading-relaxed text-ink-soft sm:text-lg">
            CANVEXIA builds software for Philippine local businesses — restaurants,
            pharmacies, print shops, laundries. You sell it in your city under your own
            name and keep {SITE.partnerShare}% of every monthly subscription. Walang
            inventory. Walang tindahan. Totoong trabaho.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Cta href="#waitlist">Join the waitlist for your city</Cta>
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
        </div>

        <div className="flex flex-col items-end">
          <ScreenFrame
            brand="YourBrand"
            label="Every product carries the partner's name, not ours."
            className="w-full"
          />
          {/* A second frame to say "products" rather than "a product", offset
              left and BELOW rather than overlapping: laid over the first it
              covered that caption, and a decorative offset is not worth a line
              of copy. Hidden on phones, where it would only crowd the first. */}
          <ScreenFrame
            brand="YourBrand"
            label="Same software, your storefront."
            className="mt-6 hidden w-2/5 self-start sm:block"
          />
        </div>
      </Container>
    </section>
  );
}
