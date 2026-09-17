import { requirePartnerPageWith } from "@/server/partners/auth";
import { listPayables } from "@/server/partners/revenue";
import { PortalShell } from "@/components/partner/PortalShell";
import { peso } from "@/components/partner/Overview";

/**
 * What this operator owes CANVEXIA.
 *
 * A SEPARATE PAGE FROM REVENUE, because it answers the opposite question.
 * Revenue is what they earned; this is the bill. Putting a payable inside an
 * earnings screen is how somebody reads a number, feels good, and misses that
 * a week's deadline is running.
 *
 * The figures here are the same ones HQ emails on the first of the month —
 * both read `PartnerStatement.hqCentavos`, so the invoice in their inbox and
 * the total on this page cannot disagree.
 */
export default async function PartnerPayablesPage() {
  const partner = await requirePartnerPageWith("revenue.view");
  const rows = await listPayables(partner.id);

  const outstanding = rows
    .filter((r) => r.status !== "paid" && r.amountCentavos > 0)
    .reduce((n, r) => n + r.amountCentavos, 0);
  const late = rows.filter((r) => r.overdue);

  return (
    <PortalShell
      partner={partner}
      title="What you owe CANVEXIA"
      subtitle="Your share is yours. This is CANVEXIA's cut of what you collected, settled monthly."
    >
      <div
        className={`mt-6 rounded-tile border p-5 ${
          late.length > 0 ? "border-guava/40 bg-guava/10" : "border-brand-ink/10 bg-white"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
          Outstanding
        </p>
        <p className="font-heading text-3xl font-bold">{peso(outstanding)}</p>
        {late.length > 0 ? (
          <p className="mt-1 text-sm font-semibold text-guava">
            {late.length} statement{late.length === 1 ? " is" : "s are"} past due. Settle to
            keep opening accounts.
          </p>
        ) : (
          <p className="mt-1 text-sm text-brand-ink/55">
            A month closes, then you have seven days. HQ emails the invoice; this is the same
            figure.
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-tile border border-dashed border-brand-ink/15 bg-white p-10 text-center">
          <p className="font-heading text-lg font-bold">Nothing yet</p>
          <p className="mt-1 text-sm text-brand-ink/55">
            Statements are frozen after each month ends. Your first one appears then.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li
              key={r.month}
              className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-brand-ink/10 bg-white px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{r.month}</span>
                <span className="block text-xs text-brand-ink/50">
                  {r.merchantCount} merchant{r.merchantCount === 1 ? "" : "s"}
                  {r.dueAt && ` · due ${r.dueAt.toLocaleDateString("en-PH")}`}
                </span>
                {r.note && <span className="block text-xs text-brand-ink/60">{r.note}</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-heading text-lg font-bold tabular-nums">
                  {peso(r.amountCentavos)}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                    r.status === "paid"
                      ? "bg-brand-ink/5 text-brand-ink/50"
                      : r.overdue
                        ? "bg-guava/15 text-guava"
                        : "bg-mango/15 text-mango"
                  }`}
                >
                  {r.status === "paid" ? "Settled" : r.overdue ? "Overdue" : "Due"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
