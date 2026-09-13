import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";

/* ------------------------------------------------------------------ icons */
function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d={path} />
    </svg>
  );
}
const ICONS = {
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M20 18v2M14 20h2",
  bolt: "M13 2L3 14h7l-1 8 10-12h-7z",
  card: "M2 7h20v10H2zM2 11h20",
  brush: "M9 11l6-6 4 4-6 6M9 11l-3 7 7-3M9 11l3 3",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  check: "M20 6L9 17l-5-5",
  receipt: "M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1zM9 8h6M9 12h6",
  bag: "M6 2l-2 4v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4zM4 6h16M16 10a4 4 0 0 1-8 0",
  star: "M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19l1-5.8L3.6 9.1l5.8-.8z",
  tag: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5z",
  spark: "M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z",
};

/* ------------------------------------------------------------------ nav */
function Nav() {
  const links = [
    ["Features", "#features"],
    ["How it works", "#how"],
    ["Pricing", "#pricing"],
    ["FAQ", "#faq"],
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-plum-ink/5 bg-cream/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <AppIcon size={32} />
          <Wordmark size="1.4rem" />
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {links.map(([l, h]) => (
            <a key={h} href={h} className="text-sm font-medium text-plum-ink/70 hover:text-plum-ink">{l}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-full px-5 py-2 text-sm font-semibold btn-brand shadow-sm">
            Log in
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------- phone mockup */
/* --------------------------------------------------------- browser mockups */
function BrowserFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white shadow-xl">
      <div className="flex items-center gap-2 border-b border-plum-ink/10 bg-cream/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-guava/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-mango/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-plum-ink/20" />
        <span className="ml-2 text-xs font-medium text-plum-ink/45">{title}</span>
      </div>
      {children}
    </div>
  );
}

function KitchenMock() {
  const cols: [string, [string, string, string][]][] = [
    ["New", [["Table 7", "2× Smoky BBQ Burger", "3m ago"], ["Table 3", "1× Truffle Fries", "1m ago"]]],
    ["Preparing", [["Table 12", "2× Mango Cheesecake", "6m ago"]]],
  ];
  return (
    <BrowserFrame title="Kitchen display · live">
      <div className="grid grid-cols-2 gap-3 p-4">
        {cols.map(([title, cards]) => (
          <div key={title}>
            <p className="mb-2 text-xs font-bold text-plum-ink/50">{title} ({cards.length})</p>
            <div className="space-y-2">
              {cards.map((c) => (
                <div key={c[0]} className="rounded-xl border border-plum-ink/10 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-sm font-extrabold">{c[0]}</span>
                    <span className="text-[10px] text-plum-ink/40">{c[2]}</span>
                  </div>
                  <p className="mt-1 text-xs text-plum-ink/70">{c[1]}</p>
                  <div className="mt-2 rounded-md py-1 text-center text-[10px] font-bold text-white btn-brand">
                    {title === "New" ? "Start preparing" : "Mark done"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

function AnalyticsMock() {
  const bars = [40, 65, 50, 80, 72, 95, 60];
  return (
    <BrowserFrame title="Analytics · last 7 days">
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3">
          {[["Revenue", "₱48.2k"], ["Orders", "312"], ["Avg rating", "4.8★"]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-cream/60 p-3">
              <p className="text-[10px] text-plum-ink/50">{l}</p>
              <p className="font-heading text-lg font-extrabold">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-28 items-end gap-2">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-md btn-brand" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

/* ------------------------------------------------------------------ page */
export default async function Home() {
  return (
    <main className="bg-cream text-plum-ink">
      <Nav />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
              ✨ Free setup · Keep 100% of your sales
            </span>
            <h1 className="mt-5 font-heading text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Stop paying{" "}
              <span className="bg-brand-gradient bg-clip-text text-transparent">30% commission</span>{" "}
              to delivery apps.
            </h1>
            <p className="mt-5 max-w-md text-lg text-plum-ink/70">
              Every GrabFood &amp; Foodpanda order quietly takes up to{" "}
              <span className="font-semibold text-plum-ink">30% of your hard-earned sales</span>. Get your
              own ordering website + QR menu so customers order direct — and you keep every peso.
            </p>
            <ul className="mt-6 max-w-md space-y-2.5">
              {[
                "Your own ordering website — 0% commission, forever.",
                "We'll generate your QR codes so diners order direct.",
                "We'll set up your menu and train your staff.",
                "Collection or delivery — the order (and the customer) stays yours.",
                "Try every feature free for 30 days — no card, no commitment.",
              ].map((line) => (
                <li key={line} className="flex items-center gap-3 text-plum-ink/75">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs text-white">
                    ✓
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              {/* Self-serve funnel: build first, decide later. */}
              <Link href="/build" className="rounded-full px-7 py-3.5 font-semibold btn-brand shadow-lg text-white">
                Create your FREE restaurant preview
              </Link>
              <a href="#how" className="rounded-full border border-plum-ink/15 bg-white px-7 py-3.5 font-semibold">
                See how it works
              </a>
              <Link href="/login" className="rounded-full border border-plum-ink/15 bg-white px-7 py-3.5 font-semibold">
                Log in
              </Link>
            </div>
            <p className="mt-3 text-sm text-plum-ink/50">
              No signup, no card — see your own ordering page in about two minutes.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["No setup fees", "No contracts", "No risk"].map((x) => (
                <span key={x} className="rounded-full border border-plum-ink/10 bg-white px-3 py-1 text-xs font-semibold text-plum-ink/60">
                  {x}
                </span>
              ))}
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/app-showcase.webp"
            alt="The Servd app — QR ordering, real-time kitchen, loyalty, inventory, and analytics"
            className="mx-auto w-full max-w-md"
          />
        </div>
      </section>

      {/* LOGOS + INTEGRATIONS */}
      <section className="border-y border-plum-ink/5 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-plum-ink/35">
            Trusted by restaurants across the metro
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 font-heading text-lg font-extrabold text-plum-ink/30">
            <span>Mango Grill</span>
            <span>Guava Café</span>
            <span>Tito&apos;s BBQ</span>
            <span>Saka Kitchen</span>
            <span>Lola&apos;s Lutong Bahay</span>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs text-plum-ink/40">Works with</span>
            {["GCash", "Visa · Mastercard", "PayMongo", "Semaphore SMS"].map((x) => (
              <span key={x} className="rounded-full border border-plum-ink/10 bg-cream px-3 py-1 text-xs font-semibold text-plum-ink/60">
                {x}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ANGLE 1 — STAFF SHORTAGE */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
            Built for the staff shortage
          </span>
          <h2 className="mt-5 font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
            Serve more customers without hiring another waiter.
          </h2>
          <p className="mt-5 text-lg text-plum-ink/70">
            Customers scan a QR code, order on their phone, and orders go directly to the
            cashier and kitchen.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            ["No waiting", "Diners order the moment they sit down."],
            ["No missed tables", "Every order is captured — nothing slips through."],
            ["No extra ordering staff", "Your team focuses on cooking and serving."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-tile border border-plum-ink/10 bg-white p-5 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-white">
                <Icon path={ICONS.check} />
              </div>
              <p className="mt-3 font-heading font-bold">{title}</p>
              <p className="mt-1 text-sm text-plum-ink/60">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ANGLE 2 — LOST SALES (BEFORE / AFTER) */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-extrabold tracking-tight">
              Your customers are ready to order. Why are they still waiting for a waiter?
            </h2>
            <p className="mt-4 text-plum-ink/70">
              Every minute a customer waits, they get annoyed, order less, and leave sooner.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {/* Before */}
            <div className="rounded-tile border border-guava/30 bg-guava/5 p-7">
              <p className="text-xs font-bold uppercase tracking-widest text-guava">Before</p>
              <ul className="mt-4 space-y-3">
                {["Customer waits", "Waiter is busy", "Order delayed"].map((s) => (
                  <li key={s} className="flex items-center gap-3 text-plum-ink/70">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-guava/15 text-xs text-guava">✕</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            {/* After */}
            <div className="rounded-tile bg-brand-gradient p-7 text-white shadow-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-white/80">After</p>
              <ul className="mt-4 space-y-3">
                {["Scan", "Order", "Kitchen receives instantly"].map((s) => (
                  <li key={s} className="flex items-center gap-3 font-semibold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-xs">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ANGLE 3 + 4 — COST COMPARISON / HIDDEN COST */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight">
            The most expensive employee in your restaurant is your manual process.
          </h2>
          <p className="mt-4 text-plum-ink/70">
            Owners rarely realize how much inefficiency quietly costs them every single day.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl items-stretch gap-6 md:grid-cols-2">
          <div className="rounded-tile border border-plum-ink/10 bg-white p-7">
            <p className="text-xs font-bold uppercase tracking-widest text-plum-ink/45">Manual ordering</p>
            <p className="mt-3 font-heading text-4xl font-extrabold text-plum-ink/80">
              ₱15,000<span className="text-2xl">–₱20,000</span>
            </p>
            <p className="mt-1 text-sm text-plum-ink/55">per month for dedicated ordering staff — plus the hidden costs below.</p>
          </div>
          <div className="rounded-tile bg-plum-ink p-7 text-cream">
            <p className="text-xs font-bold uppercase tracking-widest text-mango">With Servd</p>
            <p className="mt-3 font-heading text-4xl font-extrabold">From ₱0</p>
            <p className="mt-1 text-sm text-cream/70">per month — technology handles the ordering, around the clock.</p>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-3xl text-center">
          <p className="text-sm font-semibold text-plum-ink/50">What manual processes quietly cost you:</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            {["Wrong orders", "Missed orders", "Slow service", "Inventory discrepancies", "Long queues"].map((x) => (
              <span key={x} className="rounded-full border border-guava/30 bg-guava/5 px-3.5 py-1.5 text-sm font-semibold text-guava">
                {x}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ANGLE 5 + 6 — BUSINESS ASSET / SYSTEMS NOT MEMORY */}
      <section className="bg-plum-ink py-20 text-cream">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-extrabold tracking-tight">
              Most restaurants only sell food. Smart restaurants build customer databases.
            </h2>
            <p className="mt-4 text-cream/65">
              With Servd, every order grows an asset you actually own.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Customer data", "Know who orders, what, and how often."],
              ["Loyalty members", "Turn one-time diners into regulars."],
              ["SMS marketing", "Bring people back with a single text."],
              ["Repeat customers", "A growing base that returns on its own."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-tile border border-cream/10 bg-white/5 p-6">
                <p className="font-heading text-lg font-bold">{title}</p>
                <p className="mt-1.5 text-sm text-cream/65">{body}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-14 max-w-3xl rounded-tile border border-cream/10 bg-white/5 p-8 text-center">
            <h3 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
              Build a restaurant that can run on systems, not memory.
            </h3>
            <p className="mt-3 text-cream/70">
              Most restaurants depend on one cashier, one manager, one trusted employee — and when
              that person leaves, chaos begins. Servd turns how you operate into repeatable
              processes that stay, no matter who is on shift.
            </p>
            <a href="#how" className="mt-7 inline-block rounded-full px-7 py-3.5 font-semibold btn-brand shadow-lg text-white">
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight">Everything your restaurant needs</h2>
          <p className="mt-3 text-plum-ink/70">One platform from the table to the kitchen to the books.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [ICONS.qr, "QR ordering", "Each table has its own QR. Diners browse, customize add-ons, and order — no app, no waiting."],
            [ICONS.bolt, "Real-time kitchen", "Orders appear instantly on the kitchen display, tagged to the table. Advance them with a tap."],
            [ICONS.card, "Online payment", "GCash & cards via PayMongo. Connected accounts mean funds go straight to you."],
            [ICONS.brush, "White-label", "Your logo, colors, and even your own domain. Diners see your brand, never ours."],
            [ICONS.chart, "Analytics", "Revenue, best-sellers, peak hours, payment mix, and feedback trends — exportable."],
            [ICONS.chat, "Feedback & SMS", "Collect ratings, invite Google reviews, and run opt-in SMS promos to regulars."],
            [ICONS.box, "Inventory", "Recipes auto-deduct stock as orders cook, with low-stock alerts and COGS."],
            [ICONS.check, "HR & payroll prep", "Employees, schedules, QR time-clock, leave, and payroll-prep exports."],
            [ICONS.receipt, "Cashier & POS", "Take payments, split bills, print receipts, plus cash-out and end-of-shift reports."],
            [ICONS.bag, "Online ordering", "Your own takeout & delivery website with delivery zones and fees — beyond the table."],
            [ICONS.star, "Loyalty & rewards", "Points and rewards that turn first-time diners into regulars who keep coming back."],
            [ICONS.tag, "Promotions & coupons", "Create coupon codes — % off, free item, or buy-1-get-1 — redeemed right at checkout."],
            [ICONS.users, "Customer database", "Every order builds a CRM you own — contacts, history, and segments for marketing."],
            [ICONS.book, "Accounting", "Sales, COGS, and expense tracking with clean exports your bookkeeper will love."],
            [ICONS.spark, "AI tools", "Snap a photo to import your menu and auto-write descriptions that sell."],
          ].map(([icon, title, body]) => (
            <div key={title} className="rounded-tile border border-plum-ink/10 bg-white p-6 transition hover:shadow-lg">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white">
                <Icon path={icon} />
              </div>
              <h3 className="mt-4 font-heading text-lg font-bold">{title}</h3>
              <p className="mt-1.5 text-sm text-plum-ink/65">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SHOWCASE */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-extrabold tracking-tight">See it in action</h2>
            <p className="mt-3 text-plum-ink/70">From the table to the kitchen to your numbers — all in real time.</p>
          </div>
          <div className="mt-12 grid items-start gap-6 lg:grid-cols-2">
            <div>
              <KitchenMock />
              <h3 className="mt-4 font-heading text-lg font-bold">Real-time kitchen display</h3>
              <p className="text-sm text-plum-ink/65">New orders appear instantly, tagged to the table. Staff advance them with a tap — no shouting, no paper chaos.</p>
            </div>
            <div>
              <AnalyticsMock />
              <h3 className="mt-4 font-heading text-lg font-bold">Know your numbers</h3>
              <p className="text-sm text-plum-ink/65">Revenue, best-sellers, peak hours, and ratings — so you can decide what to cook, staff, and promote.</p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-plum-ink py-20 text-cream">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-extrabold tracking-tight">Up and running in three steps</h2>
            <p className="mt-3 text-cream/60">Your diners already know how to do it.</p>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              ["01", "Scan", "The diner scans the QR on their table — your branded menu opens instantly."],
              ["02", "Order", "They pick items and add-ons; the order lands on the kitchen screen in real time."],
              ["03", "Pay", "They pay online or at the counter, then leave a rating and a Google review."],
            ].map(([n, title, body]) => (
              <div key={n} className="relative rounded-tile border border-cream/10 bg-white/5 p-7">
                <span className="font-heading text-5xl font-extrabold text-mango/40">{n}</span>
                <h3 className="mt-2 font-heading text-xl font-bold">{title}</h3>
                <p className="mt-2 text-sm text-cream/65">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 rounded-tile bg-brand-gradient p-10 text-center text-white sm:grid-cols-3">
          {[
            ["Faster", "table turns with self-ordering"],
            ["0%", "of your sales taken — funds go to you"],
            ["1 platform", "menu, kitchen, payments, HR & stock"],
          ].map(([big, small]) => (
            <div key={small}>
              <p className="font-heading text-4xl font-extrabold">{big}</p>
              <p className="mt-1 text-sm text-white/85">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight">
            Pay once. Keep it forever.
          </h2>
          <p className="mt-3 text-plum-ink/70">
            No monthly subscription. Start free with QR ordering, then unlock only the features you
            actually want — each is a <strong>one-time payment</strong> and it&apos;s yours for good.{" "}
            <strong>We handle the setup for you</strong> — message us to get onboarded.
          </p>
        </div>

        {/* What every account gets, free */}
        <div className="mx-auto mt-10 max-w-3xl rounded-tile border border-brand-primary/25 bg-brand-primary/5 p-6 text-center">
          <p className="font-heading text-xl font-extrabold text-brand-primary">Free to start</p>
          <p className="mt-1.5 text-sm text-plum-ink/70">
            Unlimited dine-in QR codes, the cashier POS, kitchen display and your online ordering
            page — at no cost, with no card required.
          </p>
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-plum-ink/55">
          Unlock features one at a time, whenever you need them — you&apos;ll see the price for each
          inside your dashboard. Message us and we&apos;ll walk you through what fits your restaurant.
        </p>

        {/* Refund policy */}
        <div id="refund" className="mx-auto mt-12 max-w-2xl scroll-mt-24 rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
          <h3 className="font-heading text-xl font-extrabold tracking-tight">30-day refund policy</h3>
          <p className="mt-2 text-sm text-plum-ink/70">
            Not happy with a paid upgrade? We offer a <strong>30-day money-back guarantee</strong> on
            plan/system upgrade payments — just reach out within 30 days of the charge and we&apos;ll
            refund it.
          </p>
          <p className="mt-2 text-sm text-plum-ink/60">
            Please note: one-time <strong>setup fees</strong> (the agent setup / onboarding done for
            your restaurant) are <strong>non-refundable</strong>, since that work is completed up front.
          </p>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="mx-auto max-w-3xl px-6 pb-20 text-center">
        <p className="font-heading text-2xl font-bold leading-snug sm:text-3xl">
          “Servd paid for itself in a week. Orders are faster, mistakes dropped, and
          our regulars love getting our promos by text.”
        </p>
        <p className="mt-5 text-sm font-semibold text-plum-ink/60">Maria · Owner, Mango Grill</p>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center font-heading text-4xl font-extrabold tracking-tight">Questions, answered</h2>
        <div className="mt-10 space-y-3">
          {[
            ["Do diners need to download an app?", "No. They scan the QR on the table and your menu opens in their browser — order and pay right there."],
            ["Where does the money go?", "Your money goes directly to you. We don't hold any of your money — payments land in your own account."],
            ["Can I use my own branding?", "Yes — your logo, colors, tagline, and even your own domain. Diners only ever see your brand."],
            ["Is there a free trial?", "Yes — every new account starts with a 30-day free trial of every feature, no card required. When the trial ends you're moved to the Free plan automatically (QR dine-in ordering, kitchen display and cashier POS) — keep using it for free forever, or upgrade to Growth or Business for online ordering, payments, marketing and the back office."],
            ["Does it work on iPad for the cashier?", "Yes. Printing supports cloud/poll printers and AirPrint so it works on any device."],
            ["What's your refund policy?", "We offer a 30-day money-back guarantee on plan/system upgrade payments — reach out within 30 days of the charge and we'll refund it. One-time setup fees (the agent setup / onboarding done for your restaurant) are non-refundable, since that work is completed up front."],
          ].map(([q, a]) => (
            <details key={q} className="group rounded-tile border border-plum-ink/10 bg-white p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                {q}
                <span className="text-plum-ink/40 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-plum-ink/65">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-tile bg-plum-ink px-8 py-14 text-center text-cream">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight">Ready to serve smarter?</h2>
          <p className="mx-auto mt-3 max-w-md text-cream/70">
            We set up your restaurant for you — menu, QR codes, and staff, ready to go. Message us to
            get started.
          </p>
          <Link href="/login" className="mt-7 inline-block rounded-full px-8 py-3.5 font-semibold btn-brand shadow-lg">
            Log in
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-plum-ink/10 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <AppIcon size={28} />
              <Wordmark size="1.2rem" />
            </div>
            <p className="mt-3 max-w-xs text-sm text-plum-ink/55">
              QR ordering, payments, and back-office for modern restaurants.
            </p>
          </div>
          {[
            ["Product", [["Features", "#features"], ["Pricing", "#pricing"], ["Staff login", "/login"]]],
            ["Company", [["Become a partner", "/partner/apply"], ["Contact", "#"], ["Blog", "#"]]],
            ["Legal", [["Refund policy", "#refund"], ["Privacy", "#"], ["Terms", "#"], ["SMS consent", "#"]]],
          ].map(([title, rows]) => (
            <div key={title as string}>
              <p className="font-heading font-bold">{title as string}</p>
              <ul className="mt-3 space-y-2 text-sm text-plum-ink/60">
                {(rows as string[][]).map(([l, h]) => (
                  <li key={l}><Link href={h} className="hover:text-plum-ink">{l}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-plum-ink/5 py-5 text-center text-xs text-plum-ink/40">
          © {new Date().getFullYear()} Servd. Made for restaurants in the Philippines.
        </div>
      </footer>
    </main>
  );
}
