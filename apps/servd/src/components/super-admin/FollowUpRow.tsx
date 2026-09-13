"use client";

import { useState } from "react";
import { markFollowedUp } from "@/server/bizops/actions";
import { suggestedMessage } from "@/lib/bizops/follow-up";
import type { FollowUpRow as Row } from "@/server/bizops/follow-ups";

/**
 * One line of the chase list, with the message ready to paste.
 *
 * This layer never sends anything — it surfaces and suggests, and the founder
 * or VA sends it from Messenger themselves. So the useful control isn't "send",
 * it's "copy", followed by recording that it went out.
 */
export function FollowUpRowItem({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const message = suggestedMessage(row);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function complete() {
    setBusy(true);
    await markFollowedUp(row.track, row.id).catch(() => {});
    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-tile border border-mango/40 bg-mango/5 px-4 py-3 text-sm text-plum-ink/60">
        ✓ {row.name} — followed up. Next chase scheduled.
      </div>
    );
  }

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading font-bold">
            {row.restaurantId ? (
              <a
                href={`/super-admin/bizops/customers/${row.restaurantId}`}
                className="hover:text-brand-primary hover:underline"
              >
                {row.name}
              </a>
            ) : (
              row.name
            )}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                row.track === "diy_preview"
                  ? "bg-brand-primary/10 text-brand-primary"
                  : "bg-plum-ink/5 text-plum-ink/50"
              }`}
            >
              {row.track === "diy_preview" ? "built a preview" : "outreach"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-plum-ink/50">
            {row.daysSince} day{row.daysSince === 1 ? "" : "s"} waiting
            {row.step > 0 && ` · ${row.step} chase${row.step === 1 ? "" : "s"} sent`}
            {row.itemCount != null && ` · ${row.itemCount} menu items`}
            {row.contact && ` · ${row.contact}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
          >
            {open ? "Hide" : "Message"}
          </button>
          <button
            onClick={complete}
            disabled={busy}
            className="rounded-full px-4 py-1.5 text-xs font-semibold btn-brand disabled:opacity-60"
          >
            {busy ? "Saving…" : "Mark followed up"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <p className="whitespace-pre-wrap text-sm text-plum-ink/80">{message}</p>
          <button
            onClick={copy}
            className="mt-2 rounded-full border border-plum-ink/15 bg-white px-3 py-1 text-xs font-semibold hover:bg-cream"
          >
            {copied ? "✓ Copied" : "Copy for Messenger"}
          </button>
        </div>
      )}
    </div>
  );
}
