"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Search box for the subscriptions list. The rows stay server-rendered (they
 * carry server-action forms), so this just drives a `q` query param — debounced
 * so typing doesn't fire a request per keystroke. Any active status/access
 * filter is preserved alongside it.
 */
export function SubscriptionSearch({
  initial,
  keep,
}: {
  initial: string;
  /** Other query params to preserve (status / access / filter). */
  keep: Record<string, string | undefined>;
}) {
  const [value, setValue] = useState(initial);
  const router = useRouter();
  // Skip the first run so landing on the page doesn't immediately re-navigate.
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(keep)) if (v) params.set(k, v);
      const q = value.trim();
      if (q) params.set("q", q);
      const qs = params.toString();
      router.replace(`/super-admin/subscriptions${qs ? `?${qs}` : ""}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
    // `keep` is a fresh object each render — depend on the typed value only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-plum-ink/15 bg-white px-3 py-2">
      <span className="text-plum-ink/40" aria-hidden>🔍</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by restaurant name or slug…"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-plum-ink/40"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="text-plum-ink/40 hover:text-plum-ink"
        >
          ×
        </button>
      )}
    </div>
  );
}
