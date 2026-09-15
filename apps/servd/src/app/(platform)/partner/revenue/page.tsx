import Link from "next/link";
import { requirePartnerPageWith, partnerCan } from "@/server/partners/auth";
import { getRevenue } from "@/server/partners/revenue";
import { PortalNav } from "@/components/partner/PortalNav";
import { peso } from "@/components/partner/Overview";

const STATUS_CHIP: Record<string, string> = {
  pending: "bg-brand-ink/[0.06] text-brand-ink/55",
  paid: "bg-brand-ink text-white",
  overdue: "bg-guava/12 text-guava",
};

export default async function PartnerRevenuePage() {
  const partner = await requirePartnerPageWith("revenue.read");
  const { current, months } = await getRevenue(partner.id);

  return (
    <>
      <PortalNav partner={partner} />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-heading text-2xl font-bold">Revenue</h1>
          {partnerCan(partner, "revenue.pricing") && (
            <Link
              href="/partner/revenue/pricing"
              className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface"
            >
              Your pricing
            </Link>
          )}
        </div>

        <section className="mt-6 rounded-tile border border-brand-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
            This month so far · {current.month}
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-brand-ink/50">Settled by merchants</dt>
              <dd className="font-heading text-2xl font-bold tabular-nums">
                {peso(current.grossCentavos)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-brand-ink/50">Yours</dt>
              <dd className="font-heading text-2xl font-bold tabular-nums">
                {peso(current.partnerCentavos)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-brand-ink/50">CANVEXIA&rsquo;s</dt>
              <dd className="font-heading text-2xl font-bold tabular-nums">
                {peso(current.hqCentavos)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-brand-ink/45">
            {/*
              The single most important sentence on this screen. The dashboard's
              MRR card multiplies today's prices by today's merchants; this counts
              money that actually arrived. They will disagree mid-month, and a
              partner who is not told which is which has been misled by us.
            */}
            Counted from payments that actually settled, not from what was invoiced.
            This will not match the MRR on your dashboard, which multiplies today&rsquo;s
            prices by today&rsquo;s merchants.
          </p>
        </section>

        <h2 className="mt-8 font-heading text-lg font-bold">Statements</h2>
        {months.every((m) => m.lines.length === 0) ? (
          <p className="mt-3 rounded-tile border border-dashed border-brand-ink/15 bg-white p-8 text-center text-sm text-brand-ink/55">
            No settled payments yet. A statement appears once a merchant pays.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-ink/[0.07] overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
            {months.map((m) => (
              <li key={m.month}>
                <Link
                  href={`/partner/revenue/${m.month}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-brand-surface"
                >
                  <span>
                    <span className="block font-semibold">{m.month}</span>
                    <span className="block text-xs text-brand-ink/50">
                      {m.merchantCount} merchant{m.merchantCount === 1 ? "" : "s"} ·{" "}
                      {m.lines.length} payment{m.lines.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {m.payoutStatus && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                          STATUS_CHIP[m.payoutStatus] ?? STATUS_CHIP.pending
                        }`}
                      >
                        {m.payoutStatus}
                      </span>
                    )}
                    {!m.frozenAt && (
                      <span className="text-[0.65rem] uppercase tracking-wide text-brand-ink/35">
                        Not closed
                      </span>
                    )}
                    <span className="font-semibold tabular-nums">{peso(m.partnerCentavos)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-brand-ink/45">
          Months close on the 1st, Manila time. Payout status is set by CANVEXIA — if one
          looks wrong, tell us rather than waiting.
        </p>
      </div>
    </>
  );
}
