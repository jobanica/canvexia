"use client";

import { useState } from "react";

export function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
