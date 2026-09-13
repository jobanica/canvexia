import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";

export const metadata = {
  title: "Privacy policy · Servd",
  description: "What Servd collects, why, and how to have it removed.",
};

/**
 * A plain-language description of what the app actually does with data —
 * written from the code, not from a template. Required by Xendit and by
 * bulk-email providers, and linked from the /create footer.
 *
 * Keep it honest: if a data flow changes, this changes with it.
 */
export default function PrivacyPage() {
  const updated = "August 2026";

  return (
    <main className="min-h-screen bg-cream px-5 py-12 text-plum-ink">
      <article className="mx-auto max-w-2xl">
        <Link href="/create" className="flex items-center gap-2">
          <AppIcon size={24} />
          <Wordmark size="1.05rem" />
        </Link>

        <h1 className="mt-8 font-heading text-3xl font-extrabold tracking-tight">Privacy policy</h1>
        <p className="mt-1 text-sm text-plum-ink/45">Last updated {updated}</p>

        <div className="prose-servd mt-8 space-y-6 text-sm leading-relaxed text-plum-ink/75">
          <Section title="Who this covers">
            <p>
              Servd is an ordering and restaurant-management platform operated in the
              Philippines. This policy covers two different groups of people, and the
              distinction matters:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Restaurant owners and staff</strong> who sign up for Servd. We are the
                controller of that data.
              </li>
              <li>
                <strong>Diners</strong> who order from a restaurant using Servd. That data
                belongs to the restaurant; we process it on their behalf. Requests about a
                diner order should go to the restaurant you ordered from.
              </li>
            </ul>
          </Section>

          <Section title="What we collect when you build a preview">
            <p>
              If you build a restaurant preview at <span className="font-mono">/build</span>, we
              store what you type in: your restaurant name, your email address, your mobile
              number, an optional Facebook link, your logo and menu photos, and your menu items
              and prices. We also record which advertisement or link brought you to the site.
            </p>
            <p className="mt-2">
              A preview is not a live restaurant. It cannot take real orders, and it is not
              listed anywhere public until you activate it.
            </p>
          </Section>

          <Section title="What we do with your email address">
            <p>
              We use it to save your work, to send you your login details if you activate, and
              to follow up about finishing or activating your restaurant page. Every marketing
              email carries a one-click unsubscribe link, and unsubscribing stops all of it
              immediately. Emails about your own account — your username, password links,
              payment confirmations — are sent regardless, because you need them to get into
              the account you paid for.
            </p>
            <p className="mt-2">We do not sell your details or share them with other advertisers.</p>
          </Section>

          <Section title="Payments">
            <p>
              Payments are handled by <strong>Xendit</strong>. Your card or e-wallet details go
              to them, never to us — we receive only the confirmation that a payment succeeded,
              the amount, and a reference number.
            </p>
          </Section>

          <Section title="Who else processes your data">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Supabase</strong> — database, authentication, and file storage.
              </li>
              <li>
                <strong>Vercel</strong> — hosting and delivery.
              </li>
              <li>
                <strong>Xendit</strong> — payment processing.
              </li>
              <li>
                <strong>Resend</strong> — sending email.
              </li>
              <li>
                <strong>Meta (Facebook)</strong> — if the advertising pixel is enabled, Meta
                receives a signal that a page was viewed and whether an activation happened. It
                does not receive your menu, your customers, or your sales.
              </li>
            </ul>
          </Section>

          <Section title="Cookies">
            <p>
              We use a small number of cookies and none of them are for third-party
              advertising profiles: one keeps you signed in, one remembers the preview you
              built so you can come back to it, and one records which link or advertisement
              brought you here so we know which advertising is worth continuing.
            </p>
          </Section>

          <Section title="How long we keep it">
            <p>
              An abandoned preview that is never activated is cleaned up automatically. An
              active restaurant&apos;s data is kept while the account exists. You can ask us to
              delete your account and its data at any time.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              You can ask for a copy of your data, ask us to correct it, or ask us to delete
              it. Message us and we&apos;ll sort it out. You can unsubscribe from marketing email
              at any time using the link at the bottom of any of those emails.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy, or about your data:{" "}
              <a href="https://m.me/servdph" className="font-semibold text-brand-primary">
                message us on Facebook
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-10 border-t border-plum-ink/10 pt-6 text-sm">
          <Link href="/terms" className="font-semibold text-brand-primary">
            Terms of service →
          </Link>
        </div>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-lg font-bold text-plum-ink">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
