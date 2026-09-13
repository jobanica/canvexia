"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PRESETS, type PresetKey, type ReportRange } from "@/lib/time/report-range";

/**
 * Pick the window a report covers.
 *
 * Presets first, because nine times out of ten the answer is "today" or "last
 * month" and nobody wants a calendar for that. The custom pair is tucked behind
 * one tap for the tenth time — "how did last Saturday go", "what did we take
 * between the 1st and the 15th" — which previously had no answer inside the app
 * at all.
 *
 * State lives in the URL, so a range survives a refresh, can be bookmarked, and
 * can be sent to somebody else. Other query params are preserved: this sits on
 * screens that also filter by type or search, and dropping those on a date
 * change would be maddening.
 */
export function DateRangePicker({ range, basePath }: { range: ReportRange; basePath: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(range.preset === "custom");
  const [from, setFrom] = useState(range.fromKey);
  const [to, setTo] = useState(range.toKey);

  function go(next: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null) q.delete(k);
      else q.set(k, v);
    }
    // Any change to the window starts the list again from the top.
    q.delete("page");
    router.push(`${basePath}?${q.toString()}`);
  }

  const pick = (key: PresetKey) => go({ range: key, from: null, to: null });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => pick(p.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              range.preset === p.key
                ? "btn-brand text-white"
                : "border border-plum-ink/15 bg-white text-plum-ink/70"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            range.preset === "custom"
              ? "btn-brand text-white"
              : "border border-plum-ink/15 bg-white text-plum-ink/70"
          }`}
        >
          📅 Custom
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-tile border border-plum-ink/10 bg-white p-3">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-semibold text-plum-ink/60">From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-plum-ink/15 px-2 py-2 text-sm"
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-semibold text-plum-ink/60">To</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-plum-ink/15 px-2 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => go({ from, to, range: "custom" })}
            className="rounded-full px-4 py-2 text-sm font-bold btn-brand"
          >
            Apply
          </button>
        </div>
      )}

      <p className="text-xs text-plum-ink/45">Showing {range.label}</p>
    </div>
  );
}
