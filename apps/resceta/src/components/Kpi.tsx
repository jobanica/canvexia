/**
 * A figure, what it means, and nothing else.
 *
 * Server-rendered: every number here comes from a query, none of it changes
 * without a navigation, and shipping a client component to animate a total is
 * how a counter PC on a provincial DSL line starts feeling slow.
 */
export function Kpi({
  label,
  value,
  note,
  tone = "slate",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className={`rounded-xl border p-4 ${TONES[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {note && <p className="mt-0.5 text-xs opacity-70">{note}</p>}
    </div>
  );
}

/**
 * Colour carries meaning, and only three of them do.
 *
 * Money in is emerald, money still on the shelf is amber, a loss is red, and
 * everything else is plain. A grid where all six cards are a different bright
 * colour reads as decoration — the eye has nothing to catch on, which is
 * exactly when somebody stops noticing that the red one is red.
 */
const TONES = {
  slate: "border-slate-200 bg-white text-slate-900",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  red: "border-red-200 bg-red-50 text-red-900",
} as const;
