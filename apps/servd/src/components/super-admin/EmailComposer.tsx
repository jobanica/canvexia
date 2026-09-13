"use client";

import { useActionState, useState } from "react";
import {
  sendEmailCampaign,
  sendTestEmail,
  type CampaignState,
} from "@/server/email/actions";
import { SEGMENTS, MAX_RECIPIENTS, type SegmentKey } from "@/lib/email/segments";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { BUTTON_TAG } from "@/lib/email/render";

/**
 * Compose and send a campaign. The segment picker shows live counts so the
 * founder knows exactly how many people a click reaches — and the send button
 * says the number too, because "Send" with no number is how you email the
 * wrong list.
 */
export function EmailComposer({
  counts,
  configured,
}: {
  counts: Record<string, number>;
  configured: boolean;
}) {
  const [state, action] = useActionState<CampaignState, FormData>(sendEmailCampaign, null);
  const [testState, testAction] = useActionState<CampaignState, FormData>(sendTestEmail, null);
  const [segment, setSegment] = useState<SegmentKey>("leads");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const reach = Math.min(counts[segment] ?? 0, MAX_RECIPIENTS);
  const capped = (counts[segment] ?? 0) > MAX_RECIPIENTS;

  /** Append a tag to the body — quicker and less error-prone than typing it. */
  function insert(tag: string) {
    setBody((b) => (b.trimEnd() ? `${b.trimEnd()}\n\n${tag}\n` : `${tag}\n`));
  }

  return (
    <form className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <h2 className="font-heading text-lg font-bold">New campaign</h2>

      {!configured && (
        <p className="mt-2 rounded-lg bg-mango/10 px-3 py-2 text-sm text-plum-ink/70">
          Add your sending key below before you can send.
        </p>
      )}

      {/* Audience */}
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
        Who gets this
      </label>
      <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
        {SEGMENTS.map((s) => (
          <label
            key={s.key}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${
              segment === s.key
                ? "border-brand-primary bg-brand-primary/5"
                : "border-plum-ink/10"
            }`}
          >
            <input
              type="radio"
              name="segment"
              value={s.key}
              checked={segment === s.key}
              onChange={() => setSegment(s.key)}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-plum-ink">{s.label}</span>
              <span className="block text-xs text-plum-ink/45">{s.hint}</span>
            </span>
            <span className="shrink-0 font-heading text-lg font-bold text-brand-primary">
              {counts[s.key] ?? 0}
            </span>
          </label>
        ))}
      </div>

      {/* Message */}
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
        Subject
      </label>
      <input
        name="subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Your restaurant page is still waiting"
        className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />

      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
        Message
      </label>
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={10}
        placeholder={"Hi {{name}},\n\nYou built your ordering page last week — it's still saved and ready to go live.\n\n…"}
        className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 font-mono text-sm"
      />
      {/* One tap beats remembering the exact tag spelling. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[
          { tag: BUTTON_TAG, label: "+ Activate button" },
          { tag: "{{activate}}", label: "+ Activate link" },
          { tag: "{{preview}}", label: "+ Their page" },
          { tag: "{{name}}", label: "+ Restaurant name" },
        ].map((t) => (
          <button
            key={t.tag}
            type="button"
            onClick={() => insert(t.tag)}
            className="rounded-full border border-brand-primary/30 bg-brand-primary/5 px-2.5 py-1 text-xs font-semibold text-brand-primary"
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-plum-ink/45">
        <code>{BUTTON_TAG}</code> becomes a big <strong>Activate my restaurant</strong> button
        that carries <em>their own</em> build link — it opens their saved page on the payment
        step, on whatever device they read the email on. <code>{"{{activate}}"}</code> is the
        same link as plain text, <code>{"{{preview}}"}</code> is their storefront, and{" "}
        <code>{"{{name}}"}</code> is the restaurant name. Any URL you paste becomes clickable,
        and the unsubscribe link is added automatically.
      </p>

      {/* Test first */}
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-cream/60 p-3">
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-semibold text-plum-ink/60">
            Send yourself a test first
          </label>
          <input
            name="testTo"
            type="email"
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>
        <SubmitButton formAction={testAction} pendingLabel="Sending…" className="px-4 py-2">
          Send test
        </SubmitButton>
      </div>
      {testState?.ok && <p className="mt-2 text-sm text-green-700">Test sent — check your inbox.</p>}
      {testState && !testState.ok && <p className="mt-2 text-sm text-guava">{testState.error}</p>}

      {/* Send for real */}
      <div className="mt-4 border-t border-plum-ink/10 pt-4">
        <SubmitButton
          formAction={action}
          pendingLabel="Sending…"
          className="w-full py-3 text-base"
        >
          {reach > 0 ? `Send to ${reach} ${reach === 1 ? "person" : "people"}` : "Nobody to send to"}
        </SubmitButton>
        {capped && (
          <p className="mt-2 text-center text-xs text-plum-ink/45">
            Capped at {MAX_RECIPIENTS} per campaign — send again for the rest.
          </p>
        )}
        {state?.ok && (
          <p className="mt-2 text-center text-sm text-green-700">
            Sent {state.report.sent} of {state.report.recipients}
            {state.report.failed > 0 ? ` · ${state.report.failed} failed` : ""}.
          </p>
        )}
        {state && !state.ok && <p className="mt-2 text-center text-sm text-guava">{state.error}</p>}
      </div>
    </form>
  );
}
