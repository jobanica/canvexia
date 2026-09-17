import Link from "next/link";
import { RANGE_PRESETS, presetRange, type DateRange } from "@/lib/pharmacy/range";

/**
 * The date window, as links and a plain GET form.
 *
 * NO CLIENT COMPONENT AND NO ROUTER PUSH. The range lives in the query string,
 * which means a manager can bookmark last month, send it to the owner in a
 * text message, and open it on a phone that has never loaded this app before.
 * A picker that keeps the range in React state produces a screen nobody can
 * link to.
 */
export function RangeFilter({ range, path = "/" }: { range: DateRange; path?: string }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex gap-1">
        {RANGE_PRESETS.map((p) => {
          const r = presetRange(p.days);
          const active = range.from === r.from && range.to === r.to;
          return (
            <Link
              key={p.label}
              href={`${path}?from=${r.from}&to=${r.to}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <form method="get" action={path} className="flex items-end gap-2">
        <label className="text-xs font-medium text-slate-500">
          From
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          To
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:border-slate-400">
          Apply
        </button>
      </form>
    </div>
  );
}
