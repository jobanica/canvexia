"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Merchants, gross MRR and HQ MRR, last twelve months.
 *
 * THREE SERIES, where the partner's chart has two — the third is the whole
 * point of an HQ view: gross is what merchants pay, HQ is what CANVEXIA keeps
 * after every operator's share, and the gap between the two lines is the cost
 * of the partner programme. Plotting only gross would flatter the business.
 *
 * recharts was already a dependency — nothing added.
 *
 * Same honest caveat as the partner's: a GROWTH curve, not a revenue history.
 * Merchants are counted by when they were created and priced at today's plan,
 * so a merchant who upgraded last week shows the new price in every past month.
 * Real history comes from the ledger, and that is H6.
 */
export function HqGrowthChart({
  series,
}: {
  series: { month: string; merchants: number; grossCentavos: number; hqCentavos: number }[];
}) {
  const data = series.map((s) => ({
    month: s.month.slice(5),
    merchants: s.merchants,
    gross: Math.round(s.grossCentavos / 100),
    hq: Math.round(s.hqCentavos / 100),
  }));

  const LABEL: Record<string, string> = {
    gross: "Gross MRR",
    hq: "HQ share",
    merchants: "Merchants",
  };

  return (
    <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-bold">Last twelve months</h2>
        <span className="flex items-center gap-4 text-xs text-brand-ink/55">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-primary" /> Gross
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-accent" /> HQ share
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-ink" /> Merchants
          </span>
        </span>
      </div>

      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="hqGrossFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.26} />
                <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="hqShareFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-accent)" stopOpacity={0.24} />
                <stop offset="100%" stopColor="var(--brand-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,26,30,0.08)" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={52} />
            <Tooltip
              formatter={(value, name) => {
                // Coerced defensively: recharts types `value` as a union that
                // includes arrays and strings, and a NaN in a tooltip is the
                // kind of thing nobody notices until a demo.
                const n = typeof value === "number" ? value : Number(value ?? 0);
                const key = String(name);
                return key === "merchants"
                  ? [String(n), LABEL.merchants]
                  : [`₱${n.toLocaleString("en-PH")}`, LABEL[key] ?? key];
              }}
            />
            <Area
              type="monotone"
              dataKey="gross"
              stroke="var(--brand-primary)"
              strokeWidth={2}
              fill="url(#hqGrossFill)"
            />
            <Area
              type="monotone"
              dataKey="hq"
              stroke="var(--brand-accent)"
              strokeWidth={2}
              fill="url(#hqShareFill)"
            />
            <Area
              type="monotone"
              dataKey="merchants"
              stroke="var(--brand-ink)"
              strokeWidth={1.5}
              fillOpacity={0}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-brand-ink/45">
        Merchants counted by when they were opened, priced at today&rsquo;s plans. Frozen
        statements are computed from settled payments and will not match this exactly.
      </p>
    </div>
  );
}
