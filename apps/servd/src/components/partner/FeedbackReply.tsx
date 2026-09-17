"use client";

import { useActionState, useState } from "react";
import {
  replyToMerchantFeedback,
  type PartnerReplyState,
} from "@/server/partners/feedback-actions";

/**
 * Answering one merchant's message.
 *
 * COLLAPSED UNTIL ASKED FOR on a message that already has an answer, open on
 * one that does not. The inbox is a list somebody scans for the thing nobody
 * has dealt with; a textarea under every row buries it.
 *
 * It keeps its own success state rather than being unmounted by the parent on
 * the action's re-render — the same rule PartnerConvertForm is built on. Here
 * the cost of getting it wrong is smaller (the reply is safely in the database
 * either way) but the shape is identical, and a component that disappears the
 * moment it succeeds reads as a failure.
 */
export function FeedbackReply({
  id,
  answered,
  merchant,
}: {
  id: string;
  answered: boolean;
  /** Named in the button, so a long inbox does not need scrolling to re-check. */
  merchant: string;
}) {
  const [state, action, pending] = useActionState<PartnerReplyState, FormData>(
    replyToMerchantFeedback,
    null,
  );
  const [open, setOpen] = useState(!answered);

  if (state?.ok) {
    return (
      <p className="mt-3 text-sm font-semibold text-brand-primary">
        ✓ Sent. {merchant} sees it in their own dashboard.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-full border border-brand-ink/15 px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
      >
        Write another reply
      </button>
    );
  }

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`reply-${id}`} className="sr-only">
        Your reply to {merchant}
      </label>
      <textarea
        id={`reply-${id}`}
        name="reply"
        rows={3}
        required
        minLength={2}
        maxLength={4000}
        placeholder={`Reply to ${merchant}…`}
        className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          disabled={pending}
          className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send reply"}
        </button>
        {answered && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full border border-brand-ink/15 px-3.5 py-2 text-xs font-semibold text-brand-ink/60"
          >
            Cancel
          </button>
        )}
        <span className="text-xs text-brand-ink/45">
          They read it in their dashboard — it does not go out as an email.
        </span>
      </div>
      {state?.error && <p className="mt-2 text-xs text-guava">{state.error}</p>}
    </form>
  );
}
