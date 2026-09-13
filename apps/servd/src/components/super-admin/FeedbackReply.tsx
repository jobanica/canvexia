"use client";

import { useActionState, useState } from "react";
import { replyToFeedback, type ReplyState } from "@/server/platform-feedback/actions";
import { manilaDateTime } from "@/lib/time/manila";

/**
 * Answer one piece of feedback.
 *
 * Collapsed to a single button until it's wanted: the page is a queue to work
 * through, and six open textareas is a wall rather than a list. Opening one is
 * the decision to answer this one.
 *
 * Sending resolves the item, so the reply and "Mark resolved" are the same act
 * rather than two things to remember.
 */
export function FeedbackReply({
  id,
  reply,
  repliedAt,
  replyReadAt,
  emailable,
}: {
  id: string;
  reply: string | null;
  repliedAt: string | null;
  replyReadAt: string | null;
  /** Their login is a real inbox, so an email goes out as well as the dashboard note. */
  emailable: boolean;
}) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(replyToFeedback, null);
  const [open, setOpen] = useState(false);

  // The server's answer wins once we have one, so the reply appears without a
  // reload — the page this sits on is a server component.
  const sent = state?.ok;

  if (reply && !open && !sent) {
    return (
      <div className="mt-3 rounded-lg border-l-2 border-brand-primary bg-brand-primary/5 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">
          Your reply
          {repliedAt && <span className="ml-2 font-normal normal-case opacity-70">{manilaDateTime(repliedAt)}</span>}
          <span className="ml-2 font-normal normal-case opacity-70">
            {replyReadAt ? `· read ${manilaDateTime(replyReadAt)}` : "· not read yet"}
          </span>
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-plum-ink/80">{reply}</p>
        <button
          onClick={() => setOpen(true)}
          className="mt-1 text-xs font-semibold text-plum-ink/50 hover:text-plum-ink"
        >
          Edit reply
        </button>
      </div>
    );
  }

  if (sent) {
    return (
      <p className="mt-3 rounded-lg bg-mango/10 px-3 py-2 text-sm font-semibold text-mango">
        Reply sent{emailable ? " and emailed." : "."} They&apos;ll see it in their dashboard.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold hover:bg-cream"
      >
        ↩ Reply
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="reply"
        rows={4}
        required
        autoFocus
        defaultValue={reply ?? ""}
        placeholder="Write back to them…"
        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />
      <p className="text-xs text-plum-ink/45">
        {emailable
          ? "Goes to their dashboard and their email."
          : "Goes to their dashboard. Their login isn't a real inbox, so no email is sent."}{" "}
        Sending marks this resolved.
      </p>
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      <div className="flex gap-2">
        <button
          disabled={pending}
          className="rounded-full px-4 py-1.5 text-xs font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send reply"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-plum-ink/50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
