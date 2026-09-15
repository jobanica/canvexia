"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { ScorecardRow } from "@/lib/partners/scorecard";
import {
  setTargetAction,
  copyTargetsAction,
  type TargetState,
} from "@/server/partners/targets-actions";

/**
 * The scorecard: one row per person per month.
 *
 * TWO VIEWS OF THE SAME ROWS, not two queries. "Table" is the working view a
 * manager reads down; "Leaderboard" is the same rows sorted by what was closed.
 * Sorting client-side keeps them honestly identical — a leaderboard that came
 * from its own query is a leaderboard that can disagree with the table beside
 * it.
 *
 * A seat that holds only `hr.view_own` gets its own row and no toggle, because
 * a leaderboard of one is not a leaderboard.
 */
export function Scorecard({
  rows,
  month,
  months,
  canSetTargets,
  isSelfOnly,
}: {
  rows: ScorecardRow[];
  month: string;
  months: string[];
  canSetTargets: boolean;
  isSelfOnly: boolean;
}) {
  const [view, setView] = useState<"table" | "board">("table");
  const [copy, copyAction] = useActionState<TargetState, FormData>(copyTargetsAction, null);
  const [editing, setEditing] = useState<string | null>(null);

  const sorted =
    view === "board"
      ? [...rows].sort(
          (a, b) =>
            b.conversions - a.conversions ||
            b.demos - a.demos ||
            b.visits - a.visits ||
            a.name.localeCompare(b.name),
        )
      : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {months.map((m) => (
            <Link
              key={m}
              href={`/partner/team/scorecard?month=${m}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                m === month
                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                  : "border-brand-ink/15 bg-white text-brand-ink/55 hover:bg-brand-surface"
              }`}
            >
              {monthLabel(m)}
            </Link>
          ))}
        </div>

        {!isSelfOnly && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setView(view === "table" ? "board" : "table")}
              className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold hover:bg-brand-surface"
            >
              {view === "table" ? "Leaderboard" : "Table"}
            </button>
            {canSetTargets && (
              <form action={copyAction}>
                <input type="hidden" name="month" value={month} />
                <button className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold hover:bg-brand-surface">
                  Copy last month&rsquo;s targets
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {copy?.error && <p className="text-sm text-brand-ink/55">{copy.error}</p>}
      {copy?.ok && (
        <p className="text-sm text-brand-primary">
          Copied {copy.copied} {copy.copied === 1 ? "target" : "targets"}. Anything already
          set was left alone.
        </p>
      )}

      <div className="overflow-x-auto rounded-tile border border-brand-ink/10 bg-white">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-ink/10 text-left text-xs uppercase tracking-wide text-brand-ink/45">
              {view === "board" && <th className="px-4 py-3 font-semibold">#</th>}
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-3 py-3 text-right font-semibold">Visits</th>
              <th className="px-3 py-3 text-right font-semibold">Demos</th>
              <th className="px-3 py-3 text-right font-semibold">Trials</th>
              <th className="px-3 py-3 text-right font-semibold">Signed</th>
              <th className="px-3 py-3 text-right font-semibold">Rate</th>
              <th className="px-3 py-3 text-right font-semibold">Merchants</th>
              <th className="px-4 py-3 font-semibold">Against target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-ink/[0.07]">
            {sorted.map((r, i) => (
              <>
                <tr key={r.partnerUserId}>
                  {view === "board" && (
                    <td className="px-4 py-3 tabular-nums text-brand-ink/45">{i + 1}</td>
                  )}
                  <td className="px-4 py-3">
                    <Link
                      href={`/partner/team/staff/${r.partnerUserId}`}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.visits}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.demos}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.trials}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">
                    {r.conversions}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-brand-ink/60">
                    {/* No demos means NO RATE. 0% would say they tried and
                        failed, which is a different claim about somebody. */}
                    {r.conversionRate === null ? "—" : `${Math.round(r.conversionRate * 100)}%`}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-brand-ink/60">
                    {r.activeMerchants}
                    {r.churnedMerchants > 0 && (
                      <span className="text-guava"> −{r.churnedMerchants}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.progress ? (
                      <div className="flex items-center gap-2">
                        <Bar pct={r.progress.visits} label="V" />
                        <Bar pct={r.progress.demos} label="D" />
                        <Bar pct={r.progress.merchants} label="M" />
                        {r.onTarget && <span className="text-xs text-brand-primary">✓</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-brand-ink/35">no target</span>
                    )}
                    {canSetTargets && (
                      <button
                        onClick={() =>
                          setEditing(editing === r.partnerUserId ? null : r.partnerUserId)
                        }
                        className="mt-1 text-[0.68rem] font-semibold text-brand-primary"
                      >
                        {editing === r.partnerUserId ? "Cancel" : r.target ? "Edit" : "Set"}
                      </button>
                    )}
                  </td>
                </tr>
                {canSetTargets && editing === r.partnerUserId && (
                  <tr key={`${r.partnerUserId}-edit`} className="bg-brand-surface/50">
                    <td colSpan={view === "board" ? 9 : 8} className="px-4 py-3">
                      <form action={setTargetAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="partnerUserId" value={r.partnerUserId} />
                        <input type="hidden" name="month" value={month} />
                        <Num name="targetVisits" label="Visits" value={r.target?.visits ?? 0} />
                        <Num name="targetDemos" label="Demos" value={r.target?.demos ?? 0} />
                        <Num
                          name="targetMerchants"
                          label="New merchants"
                          value={r.target?.merchants ?? 0}
                        />
                        <button className="rounded-full px-4 py-2 text-xs font-semibold btn-brand text-white">
                          Save for {monthLabel(month)}
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-sm text-brand-ink/50">
                  Nothing recorded for {monthLabel(month)}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-brand-ink/45">
        Visits, demos and signings are counted from what the team logged that month.
        &ldquo;Merchants&rdquo; is what they are responsible for <em>now</em>, not at the
        end of that month — this database does not keep a subscription history to
        reconstruct that from, and inventing one would put a merchant signed last week
        into every past month.
      </p>
    </div>
  );
}

function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${label}: ${Math.round(pct * 100)}%`}>
      <span className="text-[0.6rem] text-brand-ink/40">{label}</span>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-brand-ink/8">
        <span
          className={`block h-full rounded-full ${pct >= 1 ? "bg-brand-primary" : "bg-brand-ink/30"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </span>
    </span>
  );
}

function Num({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="text-xs font-semibold text-brand-ink/50">
      <span className="block">{label}</span>
      <input
        name={name}
        type="number"
        min={0}
        defaultValue={value}
        className="mt-1 w-24 rounded-lg border border-brand-ink/15 px-3 py-2 text-sm font-normal"
      />
    </label>
  );
}

function monthLabel(m: string): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
