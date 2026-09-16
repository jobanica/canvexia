"use client";

import Link from "next/link";
import { useActionState } from "react";
import { replyAction, type InboxState } from "@/server/partners/sms-inbox-actions";
import type { ThreadSummary } from "@/server/partners/sms-inbox";

/**
 * The inbox: conversations on the left, the open one on the right.
 *
 * A LIST AND A THREAD, not a table. What somebody does here is read what a
 * business owner said and answer it, and a table of columns makes that harder
 * than a phone's own messages app does.
 */
export function Inbox({
  threads,
  openPhone,
  messages,
}: {
  threads: ThreadSummary[];
  openPhone: string | null;
  messages: { id: string; direction: string; body: string; createdAt: Date }[];
}) {
  const [state, reply, sending] = useActionState<InboxState, FormData>(replyAction, null);
  const open = threads.find((t) => t.phone === openPhone) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
      <section className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        <ul className="divide-y divide-brand-ink/[0.07]">
          {threads.map((t) => (
            <li key={t.phone}>
              <Link
                href={`/partner/sms/inbox?phone=${encodeURIComponent(t.phone)}`}
                className={`block px-4 py-3 hover:bg-brand-surface ${
                  t.phone === openPhone ? "bg-brand-surface" : ""
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {t.name ?? t.businessName ?? t.phone}
                  </span>
                  {t.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-brand-primary px-1.5 text-[0.65rem] font-bold text-white">
                      {t.unread}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-brand-ink/50">
                  {t.lastDirection === "out" ? "You: " : ""}
                  {t.lastBody}
                </span>
                <span className="mt-0.5 block text-[0.68rem] text-brand-ink/35">
                  {new Date(t.lastAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                </span>
              </Link>
            </li>
          ))}
          {threads.length === 0 && (
            <li className="px-4 py-6 text-sm text-brand-ink/50">
              Nothing yet. Replies to your campaigns land here.
            </li>
          )}
        </ul>
      </section>

      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        {!open ? (
          <p className="text-sm text-brand-ink/50">Pick a conversation.</p>
        ) : (
          <>
            <p className="text-sm font-semibold">
              {open.name ?? open.businessName ?? open.phone}
            </p>
            <p className="text-xs text-brand-ink/45">{open.phone}</p>

            <ul className="mt-4 space-y-2">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.direction === "out"
                      ? "ml-auto bg-brand-primary/10 text-brand-ink"
                      : "bg-brand-surface"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 text-[0.65rem] text-brand-ink/40">
                    {new Date(m.createdAt).toLocaleString("en-PH", {
                      timeZone: "Asia/Manila",
                      timeStyle: "short",
                      dateStyle: "medium",
                    })}
                  </p>
                </li>
              ))}
            </ul>

            <form action={reply} className="mt-4 flex gap-2">
              <input type="hidden" name="phone" value={open.phone} />
              <input
                name="body"
                required
                maxLength={800}
                placeholder="Reply…"
                className="min-h-[44px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
              />
              <button
                disabled={sending}
                className="min-h-[44px] shrink-0 rounded-full bg-brand-ink px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
            {state?.error && (
              <p role="alert" className="mt-2 text-sm text-guava">
                {state.error}
              </p>
            )}
            {/* The one rule worth stating on the screen: a reply is not
                marketing, so it does not count against anybody's weekly limit,
                and it carries no "reply STOP" line. */}
            <p className="mt-2 text-xs text-brand-ink/45">
              A reply is transactional — it doesn&rsquo;t count against their weekly limit,
              and it costs one credit per segment.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
