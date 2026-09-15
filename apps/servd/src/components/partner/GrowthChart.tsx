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
 * Merchants and MRR, last six months.
 *
 * recharts was already a dependency of this app — nothing added.
 *
 * A GROWTH curve, not a revenue history: it counts merchants by when they were
 * created and prices them at today's plan, so a merchant who upgraded last week
 * shows the new price in every past month. The caption under it says so. Real
 * history comes from the ledger, which is A4.
 */
export function GrowthChart({
  series,
}: {
  series: { month: string; merchants: number; mrrCentavos: number }[];
}) {
  const data = series.map((s) => ({
    month: s.month.slice(5),
    merchants: s.merchants,
    mrr: Math.round(s.mrrCentavos / 100),
  }));

  return (
    <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <h2 className="font-heading text-lg font-bold">Last six months</h2>
      <div className="mt-4 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,26,30,0.08)" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} />
            <Tooltip
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value ?? 0);
                return name === "mrr"
                  ? [`₱${n.toLocaleString("en-PH")}`, "MRR"]
                  : [String(n), "Merchants"];
              }}
            />
            <Area
              type="monotone"
              dataKey="mrr"
              stroke="var(--brand-primary)"
              strokeWidth={2}
              fill="url(#mrrFill)"
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
        Merchants counted by when they were opened, priced at today&rsquo;s plans. Your
        statements are computed from settled payments, so they will not match this exactly.
      </p>
    </div>
  );
}
