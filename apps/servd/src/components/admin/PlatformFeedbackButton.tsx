"use client";

import { useActionState, useEffect, useState } from "react";
import {
  submitPlatformFeedback,
  markFeedbackRepliesRead,
  type FeedbackState,
} from "@/server/platform-feedback/actions";
import type { PlatformFeedbackRow } from "@/server/platform-feedback/queries";

/**
 * Lets a restaurant owner send feedback / a recommendation about Servd itself
 * (goes to the platform super-admin). Lives in the admin sidebar.
 */
export function PlatformFeedbackButton({
  history = [],
  unreadReplies = 0,
}: {
  /** This restaurant's own past messages, with anything Servd wrote back. */
  history?: PlatformFeedbackRow[];
  unreadReplies?: number;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [state, action, pending] = useActionState<FeedbackState, FormData>(submitPlatformFeedback, null);
  const answered = history.filter((h) => h.reply);

  // Opening it is reading it. Marking on the server before the panel painted
  // would clear the dot before the owner ever saw why it was there.
  useEffect(() => {
    if (!open || unreadReplies === 0) return;
    const t = setTimeout(() => void markFeedbackRepliesRead(), 1200);
    return () => clearTimeout(t);
  }, [open, unreadReplies]);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => {
        setOpen(false);
        setRating(0);
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-plum-ink/60 hover:bg-plum-ink/5"
      >
        <span>💬 Send feedback</span>
        {unreadReplies > 0 && (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-primary px-1.5 text-[11px] font-bold text-white">
            {unreadReplies}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold">Send feedback</h2>
              <button onClick={() => setOpen(false)} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
            </div>
            <p className="mb-3 text-sm text-plum-ink/55">
              Tell us what you love, what&apos;s missing, or what we could improve. This goes
              straight to the Servd team.
            </p>

            {/* What Servd wrote back. Above the form on purpose: an owner with
                an unread reply opened this to read it, not to send another. */}
            {answered.length > 0 && (
              <div className="mb-4 max-h-64 space-y-3 overflow-y-auto">
                {answered.map((h) => (
                  <div key={h.id} className="rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
                    <p className="text-xs text-plum-ink/45">You wrote</p>
                    <p className="whitespace-pre-wrap text-sm text-plum-ink/70">{h.message}</p>
                    <div className="mt-2 border-l-2 border-brand-primary pl-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">
                        Servd replied
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-plum-ink/85">{h.reply}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {state?.ok ? (
              <p className="rounded-lg bg-mango/10 px-3 py-6 text-center text-sm font-semibold text-mango">
                🙏 Thanks for the feedback!
              </p>
            ) : (
              <form action={action} className="space-y-3">
                {/* Optional star rating */}
                <input type="hidden" name="rating" value={rating} />
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setRating(n)}
                      className={`text-2xl leading-none ${n <= rating ? "text-mango" : "text-plum-ink/20"}`}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="ml-2 text-xs text-plum-ink/40">{rating ? `${rating}/5` : "Optional rating"}</span>
                </div>

                <textarea
                  name="message"
                  rows={5}
                  required
                  placeholder="Your feedback or recommendation…"
                  className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />

                {state?.error && <p className="text-sm text-guava">{state.error}</p>}
                <button
                  disabled={pending}
                  className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
                >
                  {pending ? "Sending…" : "Send feedback"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
