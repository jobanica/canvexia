import { peso } from "@/lib/money";

/**
 * Takings per day, as bars.
 *
 * HAND-DRAWN SVG, NOT A CHARTING LIBRARY. Recharts and its peers are ~100 KB
 * of JavaScript and a client component, for a picture that never moves and
 * whose data is already on the server. This is a few hundred bytes of markup
 * and works with JavaScript off — which, in a shop whose connection drops, it
 * sometimes effectively is.
 */
export function RevenueChart({
  series,
}: {
  series: { iso: string; revenueCentavos: number; count: number }[];
}) {
  const peak = Math.max(...series.map((p) => p.revenueCentavos), 1);
  const best = series.reduce((a, b) => (b.revenueCentavos > a.revenueCentavos ? b : a), series[0]);

  return (
    <div>
      <div className="flex h-32 items-end gap-px" role="img" aria-label="Revenue per day">
        {series.map((p) => {
          // A day with takings is never invisible: a ₱20 day next to a ₱20,000
          // one rounds to nothing, and a bar of zero height reads as "closed",
          // which is a different fact.
          const pct = p.revenueCentavos === 0 ? 0 : Math.max(2, (p.revenueCentavos / peak) * 100);
          return (
            <div
              key={p.iso}
              className="flex-1 rounded-t bg-gradient-to-t from-violet-600/60 to-fuchsia-400"
              style={{ height: `${pct}%` }}
              title={`${p.iso}: ${peso(p.revenueCentavos)} · ${p.count} sale${p.count === 1 ? "" : "s"}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{series[0]?.iso}</span>
        {best && best.revenueCentavos > 0 && (
          <span>
            Best day {best.iso} · {peso(best.revenueCentavos)}
          </span>
        )}
        <span>{series[series.length - 1]?.iso}</span>
      </div>
    </div>
  );
}
