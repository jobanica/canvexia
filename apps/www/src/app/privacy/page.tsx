import type { Metadata } from "next";
import { LegalPage } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What CANVEXIA collects from the waitlist form, and what it does with it.",
};

/**
 * What the waitlist form actually does, written out.
 *
 * Describes the behaviour in this repository and nothing else — the form, the
 * hashed IP the rate limiter stores, the fact that no confirmation email is
 * sent yet. It deliberately makes no claim about a registered entity or a data
 * protection officer; those go in the bracketed line the founder fills.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="September 2026">
      <p>
        This page describes what happens to the details you type into the waitlist form
        on canvexia.com. It is short because the site does very little.
      </p>

      <h2>What we collect</h2>
      <p>
        Only what the form asks for: your name, email address, mobile number, the city
        you want to run, and optionally your province, what you do now, what you have
        sold before, and how you heard about us. You choose how many hours a week you can
        give this. Nothing else is collected about you.
      </p>

      <h2>Why we collect it</h2>
      <p>
        To contact you about the CANVEXIA city-partner programme when applications open.
        We do not sell it, rent it, or pass it to anyone outside {SITE.legalName}.
      </p>

      <h2>What the site stores automatically</h2>
      <p>
        When you submit the form we store a one-way hash of your IP address so the form
        cannot be flooded. The hash cannot be turned back into an address and is deleted
        as the counting window expires. There are no advertising cookies and no
        third-party analytics on this site.
      </p>

      <h2>Email</h2>
      <p>
        We are not sending confirmation emails yet. When we do, it will be about the
        partner programme only, and every message will have an unsubscribe link.
      </p>

      <h2>Removing your details</h2>
      <p>
        Email{" "}
        <a href={`mailto:${SITE.email}`} className="text-ink underline underline-offset-4">
          {SITE.email}
        </a>{" "}
        from the address you applied with and we will delete your row. You do not need to
        give a reason.
      </p>

      <h2>Contact</h2>
      <p>
        {SITE.legalName}, {SITE.city}. [registration details]
      </p>
    </LegalPage>
  );
}
