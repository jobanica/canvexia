import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";

const APPLY = "/partner/apply";

/**
 * The partner program, as it actually is now.
 *
 * It used to be an affiliate scheme: refer a restaurant, earn 30% of their
 * subscription for a year and 10% for life, plus milestone bonuses. All of that
 * is gone — no commission, no bonuses, no payouts, nothing to claw back.
 *
 * What replaces it is simpler and worth more to the people who were actually
 * doing this: a partner sets restaurants up themselves, as many as they like,
 * and charges those restaurants whatever they decide. Servd never sees that
 * price and never takes a share of it. So the page sells the margin they set
 * rather than a percentage we set.
 */

export const metadata: Metadata = {
  title: "Servd Partner Program — set up restaurants, set your own price",
  description:
    "Set up as many restaurants on Servd as you like and charge them whatever you decide. No commission split, no cap, no revenue share — the margin is yours.",
  openGraph: {
    title: "Become a Servd Partner",
    description:
      "Unlimited restaurant accounts. You set the price, you keep all of it. Free to join.",
    type: "website",
    images: [{ url: "/brand/servd-icon.svg" }],
  },
};

/* scan-corner bracket (QR-style) used as a faint hero motif */
function ScanCorner({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden>
      <path d="M2 14V2h12" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient font-heading text-sm font-bold text-white">
        {n}
      </div>
      <h3 className="mt-3 font-heading text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-plum-ink/60">{body}</p>
    </div>
  );
}

export default function PartnersPage() {
  return (
    <div className="bg-cream text-plum-ink">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-plum-ink/5 bg-cream/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <AppIcon size={32} />
            <Wordmark size="1.4rem" />
          </Link>
          <Link href={APPLY} className="btn-brand rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm">
            Become a partner
          </Link>
        </div>
      </header>

      {/* 1. Hero */}
      <section className="relative overflow-hidden bg-plum-ink text-cream">
        {/* brand bloom */}
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
          style={{ background: "linear-gradient(135deg,#FF9A2E,#FF7A1A,#FF4D6D)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4D6D)" }}
          aria-hidden
        />
        {/* faint scan-corner brackets */}
        <ScanCorner className="absolute left-6 top-24 h-8 w-8 text-cream/15" />
        <ScanCorner className="absolute right-6 top-24 h-8 w-8 rotate-90 text-cream/15" />

        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
          <span className="inline-block rounded-full border border-cream/20 px-3 py-1 text-xs font-semibold text-cream/80">
            Servd Partner Program
          </span>
          <h1 className="mt-5 font-heading text-4xl font-extrabold leading-tight sm:text-5xl">
            Set restaurants up on Servd. Charge whatever you like.
          </h1>
          <p className="mt-4 text-lg text-cream/80">
            No commission split and no cap on accounts. You decide what each restaurant
            pays you, and you keep all of it.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={APPLY}
              className="btn-brand rounded-full px-7 py-3 text-base font-semibold text-white shadow-lg"
            >
              Become a partner
            </Link>
            <a href="#how" className="rounded-full px-6 py-3 text-base font-semibold text-cream/80 hover:text-cream">
              See how it works →
            </a>
          </div>
          <p className="mt-4 text-sm text-cream/55">Free to join · unlimited accounts · no revenue share</p>
        </div>
      </section>

      {/* 2. How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">How it works</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Step
            n={1}
            title="Apply and get approved"
            body="A short form. Once you're approved you get a partner login and a walkthrough of the setup."
          />
          <Step
            n={2}
            title="Build them a preview"
            body="Put a restaurant's menu in and send them a working link before they've paid a peso. It sells itself."
          />
          <Step
            n={3}
            title="Turn it into their account"
            body="They said yes? One click gives that same storefront a login — menu, link and QR all carry over. You agree the fee directly with them; Servd never sees it and never takes a share."
          />
        </div>
      </section>

      {/* 3. What you actually get */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">
          What being a partner gets you
        </h2>
        <div className="mx-auto mt-8 grid max-w-3xl gap-5 sm:grid-cols-2">
          <div className="rounded-tile border-2 border-brand-primary/30 bg-white p-7">
            <p className="font-heading text-5xl font-extrabold text-brand-primary">∞</p>
            <p className="mt-2 font-semibold">Unlimited accounts</p>
            <p className="mt-1 text-sm text-plum-ink/60">
              Set up as many restaurants as you can sign. There is no cap and no per-account
              charge to you.
            </p>
          </div>
          <div className="rounded-tile border border-plum-ink/10 bg-white p-7">
            <p className="font-heading text-5xl font-extrabold">100%</p>
            <p className="mt-2 font-semibold">Of whatever you charge</p>
            <p className="mt-1 text-sm text-plum-ink/60">
              You set the price with each restaurant — setup, monthly, a package, however you
              work. None of it is split with us.
            </p>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-plum-ink/55">
          There is no commission in either direction. We don&apos;t pay you a percentage, and we
          don&apos;t take one — which is exactly why there&apos;s no ceiling on what a partner
          account is worth to you.
        </p>
      </section>

      {/* 4. Who it's for */}
      <section className="mx-auto max-w-4xl px-6 pb-16 text-center">
        <h2 className="font-heading text-2xl font-bold sm:text-3xl">Who it&apos;s for</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-plum-ink/55">
          Anyone already selling to restaurants, or willing to do the setup for them.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {[
            "Freelancers",
            "Web / IT providers",
            "POS & hardware sellers",
            "Agencies",
            "Bookkeepers",
            "Food suppliers",
          ].map((c) => (
            <span
              key={c}
              className="rounded-full border border-plum-ink/15 bg-white px-4 py-2 text-sm font-medium text-plum-ink/75"
            >
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* 5. Final CTA band */}
      <section className="px-6 pb-16">
        <div
          className="mx-auto max-w-5xl rounded-tile px-8 py-12 text-center text-white"
          style={{ background: "linear-gradient(135deg,#FF9A2E,#FF7A1A,#FF4D6D)" }}
        >
          <h2 className="font-heading text-3xl font-extrabold">Build your own book of restaurants</h2>
          <p className="mx-auto mt-2 max-w-xl text-white/90">
            Free to join, unlimited accounts, and the price you charge is yours to set and yours
            to keep.
          </p>
          <Link
            href={APPLY}
            className="mt-6 inline-block rounded-full bg-white px-7 py-3 text-base font-bold text-plum-ink shadow-lg hover:bg-cream"
          >
            Sign up as a partner
          </Link>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="border-t border-plum-ink/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-center gap-2">
            <AppIcon size={24} />
            <Wordmark size="1rem" />
          </div>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-plum-ink/45">
            Servd pays partners no commission and takes no share of what a partner charges its
            clients. What you bill a restaurant, and collecting it, is between you and them.
            Participation is subject to the Servd partner agreement.
          </p>
          <p className="mt-3 text-xs text-plum-ink/40">
            Already a partner?{" "}
            <Link href="/partner/login" className="font-semibold text-brand-primary">
              Log in
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
