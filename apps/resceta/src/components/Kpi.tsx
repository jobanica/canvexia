import {
  IconBoxes,
  IconCoins,
  IconPiggy,
  IconReceipt,
  IconTrend,
  IconWarehouse,
  IconWarning,
} from "./Icons";

/**
 * A figure, what it means, and nothing else.
 *
 * Server-rendered: every number here comes from a query, none of it changes
 * without a navigation, and shipping a client component to animate a total is
 * how a counter PC on a provincial DSL line starts feeling slow.
 *
 * THE GRADIENT IS NOT DECORATION. Six cards in six different bright colours
 * would be — the eye has nothing to catch on, which is exactly when somebody
 * stops noticing that one of them is red. Each gradient here is fixed to a
 * MEANING: money in is blue, margin is teal, counts are violet, stock is
 * amber, profit on the shelf is green, and a loss is red. The card that turns
 * red is the one that changed.
 */
const GRADIENTS = {
  revenue: "from-blue-500 to-indigo-600",
  profit: "from-teal-400 to-cyan-600",
  count: "from-violet-500 to-purple-600",
  stock: "from-amber-500 to-orange-600",
  shelf: "from-emerald-500 to-green-600",
  loss: "from-rose-500 to-red-600",
  plain: "from-slate-600 to-slate-700",
} as const;

const ICONS = {
  revenue: IconCoins,
  profit: IconTrend,
  count: IconReceipt,
  stock: IconWarehouse,
  shelf: IconPiggy,
  loss: IconWarning,
  plain: IconBoxes,
} as const;

export type KpiTone = keyof typeof GRADIENTS;

export function Kpi({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: KpiTone;
}) {
  const Icon = ICONS[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${GRADIENTS[tone]} p-5 text-white shadow-lg shadow-black/20`}
    >
      {/* A soft bloom in the corner, so a flat fill does not read as a button. */}
      <div className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-tight text-white/90">{label}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {/*
        NEVER BREAK A NUMBER. "₱184,3 / 20.00" across two lines is not a
        smaller figure, it is a different one — the eye reads the first line
        and stops. So the figure never wraps, and the card gets narrower type
        instead: the amount is the thing on the card that must survive.
      */}
      <p className="mt-3 whitespace-nowrap text-[clamp(1.05rem,2.1vw,1.75rem)] font-bold leading-tight tabular-nums">
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-white/80">{note}</p>}
    </div>
  );
}
