"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { CommissionStatementDraft } from "@servd/db";
import {
  addCommissionRuleAction,
  endCommissionRuleAction,
  markCommissionPaidAction,
  type CommissionState,
} from "@/server/partners/commissions-actions";
import { peso } from "@/components/canvexia/Cards";

interface Line {
  /** Absent on a PREVIEW line — a draft has no rows yet, so nothing to key on. */
  id?: string;
  merchantName: string | null;
  merchantId: string;
  ruleType: string;
  ruleValue: number;
  basisCentavos: number;
  amountCentavos: number;
}

interface Statement {
  id: string;
  partnerUserId: string;
  name: string;
  totalCentavos: number;
  paidAt: Date | null;
  paidReference: string | null;
  lines: Line[];
}

const RULE_COPY: Record<string, string> = {
  per_signup: "per signing",
  pct_first_month: "of the first payment",
  pct_recurring: "of every payment",
  none: "no commission",
};

export function CommissionsView({
  month,
  months,
  current,
  statements,
  preview,
  rules,
  seats,
  canManage,
}: {
  month: string;
  months: string[];
  current: string;
  statements: Statement[];
  preview: CommissionStatementDraft | null;
  rules: { id: string; partnerUserId: string; name: string; description: string }[];
  seats: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [add, addAction] = useActionState<CommissionState, FormData>(
    addCommissionRuleAction,
    null,
  );
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {months.map((m) => (
          <Link
            key={m}
            href={`/partner/commissions?month=${m}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              m === month
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                : "border-brand-ink/15 bg-white text-brand-ink/55 hover:bg-brand-surface"
            }`}
          >
            {monthLabel(m)}
            {m === current && " · now"}
          </Link>
        ))}
      </div>

      {/* --- The current month, before it freezes ------------------------- */}
      {preview && (
        <section className="rounded-tile border border-brand-primary/25 bg-brand-primary/[0.04] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">{monthLabel(month)} so far</p>
            <p className="font-heading text-xl font-bold">{peso(preview.totalCentavos)}</p>
          </div>
          <p className="mt-1 text-sm text-brand-ink/55">
            Not a statement yet. This month closes on the 1st and the figure is fixed
            then — until it does, a payment that arrives or a rule that changes moves it.
          </p>
          {preview.lines.length > 0 && <Lines lines={preview.lines} />}
        </section>
      )}

      {/* --- Frozen statements -------------------------------------------- */}
      {statements.length === 0 && !preview ? (
        <p className="rounded-tile border border-brand-ink/10 bg-white p-5 text-sm text-brand-ink/50">
          No statement for {monthLabel(month)}.
        </p>
      ) : (
        statements.map((s) => (
          <section key={s.id} className="rounded-tile border border-brand-ink/10 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="text-xs text-brand-ink/45">
                  {s.lines.length} {s.lines.length === 1 ? "line" : "lines"} ·{" "}
                  {monthLabel(month)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-heading text-xl font-bold">{peso(s.totalCentavos)}</p>
                {s.paidAt ? (
                  <p className="text-xs text-brand-primary">
                    Paid {new Date(s.paidAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}
                    {s.paidReference && ` · ${s.paidReference}`}
                  </p>
                ) : (
                  <p className="text-xs text-brand-ink/45">Not paid</p>
                )}
              </div>
            </div>

            {s.lines.length > 0 && (
              <>
                <button
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                  className="mt-2 text-xs font-semibold text-brand-primary"
                >
                  {open === s.id ? "Hide the lines" : "Show the lines"}
                </button>
                {open === s.id && <Lines lines={s.lines} />}
              </>
            )}

            {canManage && !s.paidAt && s.totalCentavos > 0 && (
              <form action={markCommissionPaidAction} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="statementId" value={s.id} />
                <label className="text-xs font-semibold text-brand-ink/50">
                  <span className="block">Reference</span>
                  <input
                    name="reference"
                    placeholder="GCash ref, cash, bank…"
                    className="mt-1 rounded-lg border border-brand-ink/15 px-3 py-2 text-sm font-normal"
                  />
                </label>
                <button className="rounded-full border border-brand-ink/15 px-4 py-2 text-xs font-semibold hover:bg-brand-surface">
                  Mark paid
                </button>
              </form>
            )}
          </section>
        ))
      )}

      {/* --- Rules (admin only) ------------------------------------------- */}
      {canManage && (
        <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
          <p className="text-sm font-semibold">Commission rules</p>
          <p className="mt-1 text-sm text-brand-ink/55">
            Several can run at once — a flat fee per signing plus a percentage of every
            payment is the usual arrangement. Rules are never edited: ending one and
            starting another keeps past statements explainable.
          </p>

          {rules.length === 0 ? (
            <p className="mt-3 text-sm text-brand-ink/50">
              Nobody is on commission yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-brand-ink/5">
              {rules.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">
                    <strong className="font-medium">{r.name}</strong>
                    <span className="text-brand-ink/55"> — {r.description}</span>
                  </span>
                  <form action={endCommissionRuleAction}>
                    <input type="hidden" name="ruleId" value={r.id} />
                    <button className="text-xs font-semibold text-guava hover:underline">
                      End it
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action={addAction} className="mt-4 grid gap-2 sm:grid-cols-2">
            <select name="partnerUserId" required className={field}>
              <option value="">Who?</option>
              {seats.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select name="type" required className={field}>
              <option value="per_signup">Flat fee per signing (₱)</option>
              <option value="pct_first_month">% of the first payment</option>
              <option value="pct_recurring">% of every payment</option>
            </select>
            <input
              name="value"
              required
              inputMode="decimal"
              placeholder="Amount in ₱, or a percentage"
              className={field}
            />
            <select name="appliesTo" className={field}>
              <option value="all_products">All products</option>
              <option value="product">One product only</option>
            </select>
            <input
              name="productId"
              placeholder="Product id, if one product only (servd / pharmacy)"
              className={`${field} sm:col-span-2`}
            />
            <div className="flex items-center gap-3 sm:col-span-2">
              <button className="rounded-full px-4 py-2 text-sm font-semibold btn-brand text-white">
                Add the rule
              </button>
              {add?.error && <span className="text-sm text-guava">{add.error}</span>}
              {add?.ok && <span className="text-sm text-brand-primary">Added.</span>}
            </div>
          </form>
        </section>
      )}

      <p className="text-xs leading-relaxed text-brand-ink/45">
        Commission follows the merchant&rsquo;s assigned salesperson as it stands when the
        month closes. Reassigning a merchant mid-month moves that month&rsquo;s commission
        with it. This is not payroll — no tax, no deductions, and paying it happens
        outside this system.
      </p>
    </div>
  );
}

function Lines({ lines }: { lines: Line[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[440px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-brand-ink/45">
            <th className="py-2 font-semibold">Merchant</th>
            <th className="py-2 font-semibold">Rule</th>
            <th className="py-2 text-right font-semibold">Of</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-ink/5">
          {lines.map((l, i) => (
            <tr key={l.id ?? i}>
              <td className="py-2">{l.merchantName ?? l.merchantId}</td>
              <td className="py-2 text-brand-ink/55">
                {l.ruleType === "per_signup"
                  ? `₱${Math.round(l.ruleValue / 100).toLocaleString("en-PH")} ${RULE_COPY.per_signup}`
                  : `${(l.ruleValue / 100).toFixed(2)}% ${RULE_COPY[l.ruleType] ?? ""}`}
              </td>
              <td className="py-2 text-right tabular-nums text-brand-ink/55">
                {l.ruleType === "per_signup" ? "—" : peso(l.basisCentavos)}
              </td>
              <td className="py-2 text-right tabular-nums font-semibold">
                {peso(l.amountCentavos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const field = "min-h-[44px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm";

function monthLabel(m: string): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
