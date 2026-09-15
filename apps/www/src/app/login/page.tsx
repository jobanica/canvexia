import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LegalPage } from "@/components/Legal";
import { Cta } from "@/components/ui";
import { SITE, portalIsExternal } from "@/lib/site";

export const metadata: Metadata = {
  title: "Partner portal",
  description: "The CANVEXIA partner portal.",
  robots: { index: false },
};

/**
 * The fallback behind "Partner login".
 *
 * Once NEXT_PUBLIC_PORTAL_URL points at partner.canvexia.com the nav links
 * straight there and nobody reaches this page — except by typing /login, which
 * is why it redirects rather than showing a "launching soon" notice to a
 * partner whose portal is live.
 */
export default function LoginPage() {
  if (portalIsExternal) redirect(SITE.portalUrl);

  return (
    <LegalPage title="Partner portal launching soon" updated="September 2026">
      <p>
        The partner portal is being built. There are no partner accounts yet, so there is
        nothing to sign in to — when the partner system opens, everyone on the waitlist
        is contacted with their login.
      </p>
      <p>
        If you are looking for a restaurant account, that is Servd:{" "}
        <a
          href={SITE.servdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink underline underline-offset-4"
        >
          servdph.net
        </a>
        .
      </p>
      <div className="pt-2">
        <Cta href="/#waitlist">Join the waitlist for your city</Cta>
      </div>
    </LegalPage>
  );
}
