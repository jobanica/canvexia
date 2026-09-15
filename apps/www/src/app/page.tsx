import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Steps } from "@/components/Steps";
import { WhatYouGet } from "@/components/WhatYouGet";
import { Products } from "@/components/Products";
import { Calculator } from "@/components/Calculator";
import { Cities } from "@/components/Cities";
import { Compare } from "@/components/Compare";
import { ForWhom } from "@/components/ForWhom";
import { Founder } from "@/components/Founder";
import { WaitlistCities } from "@/components/WaitlistCities";
import { Faq } from "@/components/Faq";
import { WaitlistForm } from "@/components/WaitlistForm";
import { Footer } from "@/components/Footer";
import { CtaBanner, ContactBar } from "@/components/CtaBanner";
import { CityProvider } from "@/components/city-context";
import { Section, SectionHead } from "@/components/ui";
import { SITE } from "@/lib/site";
import { getTerritories, getWaitlistCities } from "@/server/territories";

/**
 * canvexia.com — the twelve sections, in order.
 *
 * A server component. The four that need the browser (nav, calculator, city
 * finder, form) say "use client" themselves; the other eight, the FAQ included,
 * ship as HTML. `CityProvider` wraps everything so the finder in section 6 can
 * hand a city to the form in section 11 — a client provider around
 * server-rendered children does not make those children client components.
 *
 * Both database reads are cached and both fall back to an empty list, so the
 * page renders — and the form still works — when the database is unreachable.
 */
export const revalidate = 600;

export default async function HomePage() {
  const [territories, waitlistCities] = await Promise.all([
    getTerritories(),
    getWaitlistCities(),
  ]);

  return (
    <CityProvider>
      <Nav />
      <main>
        <Hero />
        <Steps />
        <WhatYouGet />
        <Products />
        <Calculator />
        <CtaBanner
          title="Have a city in mind?"
          line="Tell us which one. No fee, no application, no commitment."
          action="Join the waitlist"
        />
        <Cities territories={territories} />
        <Compare />
        <ForWhom />
        <Founder />
        <WaitlistCities cities={waitlistCities} territories={territories} />
        <Faq />

        <Section id="waitlist" tone="white" className="border-t border-line scroll-mt-20">
          <SectionHead
            centered
            eyebrow="Join the waitlist"
            title="Tell us your city."
            lead="No fee, no application, no commitment. When the partner system opens we contact this list in order."
          />
          <div className="mt-10">
            <WaitlistForm />
          </div>
        </Section>

        <ContactBar email={SITE.email} site="canvexia.com" />
      </main>
      <Footer />
    </CityProvider>
  );
}
