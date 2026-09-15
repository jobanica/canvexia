import type { Metadata } from "next";
import { LegalPage } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms that apply to using canvexia.com and joining the waitlist.",
};

/**
 * Terms for a site that sells nothing yet.
 *
 * The important clause is the one that says joining the waitlist is not an
 * agreement and reserves no city. Everything a partner will actually be bound
 * by lives in the partner agreement, which does not exist yet — and this page
 * says so rather than summarising one that has not been written.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="September 2026">
      <p>
        These terms cover this website and the waitlist. They are not a partner
        agreement.
      </p>

      <h2>The waitlist is not an application</h2>
      <p>
        Joining the waitlist costs nothing, commits you to nothing, and reserves no city.
        It does not create any partnership, franchise, agency or employment relationship
        with {SITE.legalName}. Applications are not open.
      </p>

      <h2>Figures on this site</h2>
      <p>
        The calculator multiplies numbers you choose by the published{" "}
        {SITE.partnerShare}% partner share. It is arithmetic, not a forecast, and it is
        not a representation that any partner will earn any amount. Licence fees shown
        are current at the date above and may change before applications open.
      </p>

      <h2>Exclusivity and milestones</h2>
      <p>
        Territory exclusivity, the milestones that maintain it, and everything else about
        being a partner will be set out in a written partner agreement. Nothing on this
        page grants any of it.
      </p>

      <h2>Products</h2>
      <p>
        Product status on this site — live, in development, coming — is accurate at the
        date above. A product described as in development or coming is not available to
        sell.
      </p>

      <h2>Contact</h2>
      <p>
        {SITE.legalName}, {SITE.city} —{" "}
        <a href={`mailto:${SITE.email}`} className="text-ink underline underline-offset-4">
          {SITE.email}
        </a>
        . [registration details]
      </p>
    </LegalPage>
  );
}
