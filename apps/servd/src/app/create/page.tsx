import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { Cta, CtaNote } from "@/components/create/Cta";
import { StickyCta } from "@/components/create/StickyCta";
import { LazyVideo } from "@/components/media/LazyVideo";
import { Pixel, LandingView } from "@/components/create/Pixel";
import { PhoneMock } from "@/components/create/PhoneMock";
import { getLandingConfig } from "@/server/landing/settings";

/**
 * The Facebook-ad landing page. One job: get a food-business owner anywhere in
 * the Philippines, on a phone, inside the Facebook in-app browser, to tap
 * through into /build.
 *
 * The audience is every kind of food business — restaurants, cafés, milk tea
 * shops, carinderias, cloud kitchens — so the copy names them rather than
 * assuming "restaurant" covers it. Someone running a milk tea shop reads
 * "restaurant" and decides the page isn't for them.
 *
 * Three things are deliberate and worth keeping:
 *
 *  • NO NAVIGATION. No header menu, no links to the marketing site, nothing
 *    outbound above the footer. Every link that isn't the CTA is a way to lose
 *    someone we paid for.
 *  • NO DATA CAPTURE. The first field they ever see is inside the builder,
 *    where it's attached to something they want. Asking here would trade the
 *    click for a form.
 *  • NOTHING BLOCKING. The video is a facade until tapped, the phone is markup
 *    rather than an image, and the pixel loads after interactive — the in-app
 *    browser is slow and every kilobyte before the hero is paid for in people.
 *
 * The only server read is the landing config, behind a tagged cache.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.servdph.com";
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

const TITLE = "Create your restaurant's online ordering page — free";
const DESCRIPTION =
  "Upload your logo and menu, build your preview, and experience how your customers can order online. No credit card. ₱499 one-time to activate.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/create" },
  // These links get pasted into Messenger threads constantly. A bare URL with
  // no card looks like spam, and looking like spam costs more than the ad did.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/create",
    siteName: "Servd",
    type: "website",
    locale: "en_PH",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  "Add your restaurant details",
  "Upload your logo & menu",
  "Preview your online ordering page",
  "Try placing an order yourself",
];

const BENEFITS: [string, string, string][] = [
  [
    "🚫",
    "Stop paying 25% to delivery apps",
    "Your own ordering page means commission-free direct orders. Buo ang kita mo.",
  ],
  [
    "🤝",
    "Your customers become yours",
    "Not locked behind GrabFood or Foodpanda — you keep the order and the customer.",
  ],
  [
    "⚡",
    "Ready in minutes, not weeks",
    "Build it yourself, see it instantly, and activate whenever you're ready.",
  ],
];

const FAQ: [string, string][] = [
  [
    "Is it really free to try?",
    "Yes — build your full preview and experience the ordering flow free. The ₱499 one-time payment only comes when you're ready to accept real orders.",
  ],
  [
    "What do I need to start?",
    "Just your restaurant name, logo, and a few menu items. It takes a few minutes, and you can come back and add the rest later.",
  ],
  [
    "What happens after I activate?",
    "Your page goes live right away and we email you your username plus a link to set your own password. From there you can add the rest of your menu, print your table QR codes, and start taking orders.",
  ],
  [
    "Do I pay monthly?",
    "No. Activation is a one-time ₱499 and your online ordering page is yours for good — walang monthly bayad. Other features are optional one-time unlocks you can add later if you want them.",
  ],
];

/**
 * Reads no per-request state — no searchParams, no cookies. The one read is
 * the landing config, and that goes through a tagged cache so the video can be
 * changed from super-admin without putting a database round-trip in front of
 * the hero on every ad click.
 *
 * The ad tags still reach /build: the middleware puts them in a cookie on the
 * way in, and the CTA appends them to the href at click time.
 */
export default async function CreatePage() {
  const buildHref = "/build";
  const { videoUrl, posterUrl } = await getLandingConfig();

  return (
    <main className="bg-cream text-plum-ink">
      <Pixel pixelId={PIXEL_ID} />
      <LandingView />

      {/* Brand mark only — deliberately not a link, and deliberately not a nav.
          There is nowhere else on this page to go. */}
      <div className="flex items-center justify-center gap-2 px-5 pt-6">
        <AppIcon size={26} />
        <Wordmark size="1.15rem" />
      </div>

      {/* ---------------------------------------------------------- HERO */}
      <section className="relative overflow-hidden px-5 pb-12 pt-6 sm:pt-10">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
        <div className="relative mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <h1 className="font-heading text-[2rem] font-extrabold leading-[1.12] tracking-tight sm:text-5xl">
              Create Your Restaurant&apos;s Online Ordering Page —{" "}
              <span className="bg-brand-gradient bg-clip-text text-transparent">Free</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base text-plum-ink/70 sm:text-lg lg:mx-0">
              Upload your logo and menu, build your preview, and experience how your customers
              can order online.
            </p>

            <div data-cta-anchor className="mt-7">
              <Cta href={buildHref} />
              <CtaNote>No credit card • No commitment • ₱499 one-time to activate</CtaNote>
            </div>
          </div>

          {/* Below the copy on mobile, beside it on desktop. It must NOT lead on
              a phone: a mockup that looks like a screenshot pushes the headline
              and the CTA off the fold, and the CTA above the fold is the whole
              job of this page. */}
          <div className="mt-10 lg:mt-0">
            <PhoneMock />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- HOW IT WORKS */}
      <section className="bg-white px-5 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
            🎥 See How Easy It Is
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-plum-ink/65">
            <span className="font-semibold text-plum-ink">
              Watch How to Create Your Restaurant Preview
            </span>{" "}
            You can have your own online ordering page in just a few minutes.
          </p>

          {videoUrl && (
            <div className="mt-7">
              <LazyVideo src={videoUrl} poster={posterUrl || undefined} />
            </div>
          )}

          <ol className="mt-8 grid gap-3 sm:grid-cols-2">
            {STEPS.map((label, i) => (
              <li
                key={label}
                className="flex items-center gap-3 rounded-tile border border-plum-ink/10 bg-cream/50 p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient font-heading text-sm font-extrabold text-white">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold leading-snug">{label}</span>
              </li>
            ))}
          </ol>

          <div data-cta-anchor className="mt-9 text-center">
            <p className="mb-3 font-heading text-lg font-bold">Ready to try it?</p>
            <Cta href={buildHref} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ BENEFITS */}
      <section className="px-5 py-14">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
          {BENEFITS.map(([emoji, title, body]) => (
            <div
              key={title}
              className="rounded-tile border border-plum-ink/10 bg-white p-5 text-center sm:text-left"
            >
              <div className="text-2xl">{emoji}</div>
              <h3 className="mt-2 font-heading text-base font-bold leading-snug">{title}</h3>
              <p className="mt-1.5 text-sm text-plum-ink/60">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------- SOCIAL PROOF */}
      {/* TODO: real testimonial. Swap this for one named business and one real
          number the moment there is one ("This ramen shop saved ₱14k in
          commissions last month") — a named result outsells any generic claim,
          and an invented one isn't worth having. */}
      <section className="bg-plum-ink px-5 py-12 text-cream">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-mango">
            Para sa lahat ng food business sa Pilipinas
          </p>
          <p className="mt-4 font-heading text-xl font-bold leading-snug sm:text-2xl">
            Restaurant, café, milk tea shop, carinderia, bakery, cloud kitchen — kung nagbebenta
            ka ng pagkain, para sa&apos;yo ito.
          </p>
          <p className="mt-4 text-sm text-cream/60">
            Build your preview and see exactly what your customers would see — before you decide
            anything.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ FAQ */}
      <section className="px-5 py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
            Mga tanong, sagot
          </h2>
          <div className="mt-6 space-y-2.5">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group rounded-tile border border-plum-ink/10 bg-white p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold">
                  {q}
                  <span className="shrink-0 text-lg text-plum-ink/35 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-plum-ink/65">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- FINAL CTA */}
      <section className="px-5 pb-16">
        <div data-cta-anchor className="mx-auto max-w-2xl rounded-tile bg-white p-6 text-center shadow-sm sm:p-8">
          <h2 className="font-heading text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            Build your restaurant&apos;s ordering page now
          </h2>
          <div className="mt-6">
            <Cta href={buildHref} />
            <CtaNote>No credit card • No commitment</CtaNote>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- FOOTER */}
      <footer className="border-t border-plum-ink/10 bg-white px-5 py-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2">
            <AppIcon size={22} />
            <Wordmark size="1rem" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-plum-ink/45">
            <Link href="/privacy" className="hover:text-plum-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-plum-ink">
              Terms
            </Link>
            <a href="https://m.me/servdph" className="hover:text-plum-ink">
              Message us
            </a>
          </div>
          <p className="text-xs text-plum-ink/35">
            © {new Date().getFullYear()} Servd. Made for restaurants in the Philippines.
          </p>
        </div>
        {/* Room for the sticky bar so it can't cover the footer links. */}
        <div className="h-16 sm:hidden" />
      </footer>

      <StickyCta href={buildHref} />
    </main>
  );
}
