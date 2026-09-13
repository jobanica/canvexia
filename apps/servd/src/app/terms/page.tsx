import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";

export const metadata = {
  title: "Terms of service · Servd",
  description: "The terms you agree to when you use Servd.",
};

/**
 * Written from what the code actually does — the ₱499 is a one-time payment for
 * a lifetime online-ordering page, previews can't take real orders, and the
 * refund position matches the one already published on the home page.
 */
export default function TermsPage() {
  const updated = "August 2026";

  return (
    <main className="min-h-screen bg-cream px-5 py-12 text-plum-ink">
      <article className="mx-auto max-w-2xl">
        <Link href="/create" className="flex items-center gap-2">
          <AppIcon size={24} />
          <Wordmark size="1.05rem" />
        </Link>

        <h1 className="mt-8 font-heading text-3xl font-extrabold tracking-tight">
          Terms of service
        </h1>
        <p className="mt-1 text-sm text-plum-ink/45">Last updated {updated}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-plum-ink/75">
          <Section title="What Servd is">
            <p>
              Servd provides restaurants with an online ordering page, QR table ordering, and
              related back-office tools. You use it to sell your own food to your own
              customers. We are not a delivery service, a marketplace, or a party to the
              transaction between you and your diner.
            </p>
          </Section>

          <Section title="Previews">
            <p>
              A preview you build is a demonstration. It cannot accept real orders and takes no
              payments. Previews that are never activated are removed automatically after a
              period of inactivity.
            </p>
          </Section>

          <Section title="Activation and what you pay">
            <p>
              Activation costs <strong>₱499, once</strong>. It is not a subscription and there
              is no monthly fee for your online ordering page — once activated it stays yours.
            </p>
            <p className="mt-2">
              Other features are optional and sold separately as one-time unlocks. You will see
              the price for each inside your dashboard before you buy it. We may change the
              price of features you have not bought; we will not retroactively charge you for
              one you already own.
            </p>
          </Section>

          <Section title="Refunds">
            <p>
              We offer a 30-day money-back guarantee on plan and feature upgrade payments —
              reach out within 30 days of the charge and we&apos;ll refund it. One-time setup
              fees, where an agent has done onboarding work for your restaurant, are
              non-refundable because that work is completed up front.
            </p>
          </Section>

          <Section title="Your account">
            <p>
              You are responsible for your login and for anything done with it, including by
              your staff. Keep your password to yourself; we will never ask you for it, and we
              never send it by email — we cannot, because we do not store it in a readable
              form.
            </p>
          </Section>

          <Section title="Your content and your customers">
            <p>
              Your menu, photos, branding, and customer records are yours. We store and process
              them so the service works, and we do not sell them or use them to compete with
              you. You are responsible for the accuracy of what you publish — prices, allergen
              information, and anything else your customers rely on.
            </p>
          </Section>

          <Section title="Acceptable use">
            <p>
              Don&apos;t use Servd to sell anything you&apos;re not legally allowed to sell,
              to send messages people didn&apos;t agree to receive, or to attack or overload
              the service. We may suspend an account that does.
            </p>
          </Section>

          <Section title="Availability">
            <p>
              We work to keep the service running, but we don&apos;t promise it will never be
              unavailable. Where things are outside our control — a payment provider outage, an
              internet failure, hosting problems — we&apos;ll tell you what we know and fix
              what we can.
            </p>
          </Section>

          <Section title="Ending it">
            <p>
              You can stop using Servd and ask us to delete your account at any time. A
              one-time payment already made is covered by the refund terms above, not by the
              act of closing the account.
            </p>
          </Section>

          <Section title="Governing law">
            <p>These terms are governed by the laws of the Republic of the Philippines.</p>
          </Section>

          <Section title="Contact">
            <p>
              Questions:{" "}
              <a href="https://m.me/servdph" className="font-semibold text-brand-primary">
                message us on Facebook
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-10 border-t border-plum-ink/10 pt-6 text-sm">
          <Link href="/privacy" className="font-semibold text-brand-primary">
            Privacy policy →
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
