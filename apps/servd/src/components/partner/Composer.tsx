"use client";

import { useActionState, useState } from "react";
import { MERGE_FIELDS, countSegments, minutesToLabel, withOptOut } from "@servd/core";
import {
  cancelCampaignAction,
  createCampaignAction,
  estimateAction,
  testSendAction,
  type CampaignState,
} from "@/server/partners/sms-campaign-actions";

const initial: CampaignState = { status: "idle" };

const SOURCES = [
  { value: "visit", label: "Met at a visit" },
  { value: "lead_form", label: "Enquiry form" },
  { value: "merchant_owner", label: "Merchant owner" },
  { value: "import", label: "Imported" },
  { value: "manual", label: "Added by hand" },
];

/**
 * The composer.
 *
 * THE COUNTER IS THE POINT OF THIS SCREEN. A text is billed per 160-character
 * segment — 70 if it contains one character outside the GSM-7 alphabet, which
 * an emoji, a curly apostrophe or the ₱ sign all are. Somebody who cannot see
 * that quadruples their own bill with one paste and finds out at the end of the
 * month. So the count, the encoding and the reason are on screen as they type.
 */
export function Composer({
  tags,
  stages,
  team,
  campaigns,
  balance,
  senderName,
  window: sendWindow,
  cap,
}: {
  tags: string[];
  stages: { value: string; label: string }[];
  team: { id: string; name: string }[];
  campaigns: {
    id: string;
    name: string;
    body: string;
    status: string;
    scheduledAt: Date | null;
    sentAt: Date | null;
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    creditsSpent: number;
  }[];
  balance: number;
  senderName: string;
  window: { startMin: number; endMin: number };
  cap: { count: number; days: number };
}) {
  const [body, setBody] = useState("");
  const [estimateState, estimateNow, estimating] = useActionState(estimateAction, initial);
  const [sendState, send, sending] = useActionState(createCampaignAction, initial);
  const [testState, test, testing] = useActionState(testSendAction, initial);
  const [cancelState, cancel] = useActionState(cancelCampaignAction, initial);

  // What the recipient will actually receive, opt-out line and all — that is
  // what is counted and charged, so that is what is shown.
  const preview = withOptOut(body || "");
  const count = countSegments(preview);

  const field =
    "min-h-[44px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm outline-none focus:border-brand-ink";

  return (
    <div className="space-y-5">
      <form className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <div className="grid gap-3">
          <input name="name" placeholder="Name this campaign (only you see it)" className={field} />

          <div>
            <textarea
              name="body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {name}, we're running a promo for {business_name} this week…"
              className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
            />
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-semibold tabular-nums">
                {count.length} characters · {count.segments}{" "}
                {count.segments === 1 ? "segment" : "segments"}
              </span>
              <span
                className={
                  count.encoding === "GSM-7" ? "text-brand-ink/45" : "font-semibold text-mango"
                }
              >
                {count.encoding}
                {count.encoding === "UCS-2" &&
                  " — an emoji, a curly apostrophe or ₱ halves what fits in a segment"}
              </span>
              <span className="text-brand-ink/45">
                {count.remaining} left before the next segment
              </span>
            </div>
          </div>

          <p className="text-xs text-brand-ink/50">
            Merge fields:{" "}
            {MERGE_FIELDS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setBody((b) => `${b}{${f}}`)}
                className="mr-1.5 rounded border border-brand-ink/15 px-1.5 py-0.5 font-mono text-[0.7rem] hover:bg-brand-surface"
              >
                {`{${f}}`}
              </button>
            ))}
          </p>

          {/* The rendered preview, including the line that cannot be removed. */}
          <div className="rounded-lg bg-brand-surface/70 px-3 py-2 text-sm">
            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-brand-ink/40">
              They see this, from {senderName}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{preview || "…"}</p>
          </div>
        </div>

        <fieldset className="mt-5 border-t border-brand-ink/10 pt-4">
          <legend className="text-sm font-semibold">Who gets it</legend>
          <p className="mt-1 text-xs text-brand-ink/50">
            Only people who opted in are ever included — that is not a filter and cannot be
            switched off.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-brand-ink/60">
              Tags
              <select name="tags" multiple size={3} className={`${field} mt-1 py-2`}>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-brand-ink/60">
              How we met them
              <select name="sources" multiple size={3} className={`${field} mt-1 py-2`}>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-brand-ink/60">
              Pipeline stage
              <select name="stages" multiple size={3} className={`${field} mt-1 py-2`}>
                {stages.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-brand-ink/60">
              Assigned to
              <select name="assignedToId" className={`${field} mt-1`}>
                <option value="">Anyone</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 block text-xs font-semibold text-brand-ink/60">
            Skip anyone texted in the last N days (optional)
            <input name="quietDays" type="number" min={0} max={90} className={`${field} mt-1`} />
          </label>
        </fieldset>

        <fieldset className="mt-5 border-t border-brand-ink/10 pt-4">
          <legend className="text-sm font-semibold">When</legend>
          <label className="mt-2 block text-xs font-semibold text-brand-ink/60">
            Leave blank to send as soon as the window allows
            <input name="scheduledAt" type="datetime-local" className={`${field} mt-1`} />
          </label>
          <p className="mt-2 text-xs text-brand-ink/50">
            Your send window is {minutesToLabel(sendWindow.startMin)}–
            {minutesToLabel(sendWindow.endMin)} Manila, and nobody gets more than {cap.count}{" "}
            marketing texts in {cap.days} days. Anything outside that waits for the next slot.
          </p>
        </fieldset>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            formAction={estimateNow}
            disabled={estimating}
            className="min-h-[44px] rounded-full border border-brand-ink/15 px-5 text-sm font-semibold disabled:opacity-60"
          >
            {estimating ? "Counting…" : "How many, and what will it cost?"}
          </button>
          <button
            formAction={test}
            disabled={testing}
            className="min-h-[44px] rounded-full border border-brand-ink/15 px-5 text-sm font-semibold disabled:opacity-60"
          >
            {testing ? "Sending…" : "Test on me"}
          </button>
          <button
            formAction={send}
            disabled={sending}
            className="min-h-[44px] rounded-full bg-brand-ink px-6 text-sm font-semibold text-white disabled:opacity-60"
          >
            {sending ? "Queueing…" : "Queue it"}
          </button>
        </div>

        {estimateState.status === "estimated" && (
          <div className="mt-4 rounded-lg border border-brand-ink/10 bg-brand-surface/60 p-4 text-sm">
            <p className="font-semibold">
              {estimateState.eligible.toLocaleString("en-PH")} people ·{" "}
              {estimateState.credits.toLocaleString("en-PH")} credits
            </p>
            {estimateState.suppressed > 0 && (
              <p className="mt-1 text-xs text-brand-ink/60">
                {estimateState.suppressed.toLocaleString("en-PH")} of the{" "}
                {estimateState.recipients.toLocaleString("en-PH")} matched have already had
                their limit this week, so they are not included — and not charged for.
              </p>
            )}
            {!estimateState.affordable && (
              <p className="mt-1 text-xs font-semibold text-guava">
                That is more than the {estimateState.balance.toLocaleString("en-PH")} credits
                you have. Top up first.
              </p>
            )}
          </div>
        )}

        {[sendState, testState, estimateState].map((s, i) =>
          s.status === "error" ? (
            <p key={i} role="alert" className="mt-3 text-sm text-guava">
              {s.message}
            </p>
          ) : null,
        )}
        {sendState.status === "done" && (
          <p className="mt-3 text-sm text-brand-primary">{sendState.message}</p>
        )}
        {testState.status === "done" && (
          <p className="mt-3 text-sm text-brand-primary">{testState.message}</p>
        )}
        <p className="mt-3 text-xs text-brand-ink/40">
          {balance.toLocaleString("en-PH")} credits in the wallet.
        </p>
      </form>

      <section className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        <p className="border-b border-brand-ink/10 px-4 py-3 text-sm font-semibold">Campaigns</p>
        <ul className="divide-y divide-brand-ink/[0.07]">
          {campaigns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{c.name}</span>
                <span className="block truncate text-xs text-brand-ink/50">{c.body}</span>
                <span className="mt-0.5 block text-xs text-brand-ink/45">
                  {statusLine(c)}
                </span>
              </span>
              {(c.status === "scheduled" || c.status === "sending") && (
                <form action={cancel}>
                  <input type="hidden" name="campaignId" value={c.id} />
                  <button className="text-xs font-semibold text-guava hover:underline">
                    Stop
                  </button>
                </form>
              )}
            </li>
          ))}
          {campaigns.length === 0 && (
            <li className="px-4 py-6 text-sm text-brand-ink/50">Nothing sent yet.</li>
          )}
        </ul>
        {cancelState.status === "error" && (
          <p role="alert" className="px-4 py-2 text-sm text-guava">
            {cancelState.message}
          </p>
        )}
      </section>
    </div>
  );
}

function statusLine(c: {
  status: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  creditsSpent: number;
}): string {
  const fmt = (d: Date) =>
    new Date(d).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

  switch (c.status) {
    case "scheduled":
      return `Queued for ${c.recipientCount.toLocaleString("en-PH")}${
        c.scheduledAt ? ` · goes out ${fmt(c.scheduledAt)}` : ""
      }`;
    case "sending":
      return `Sending — ${c.sentCount.toLocaleString("en-PH")} of ${c.recipientCount.toLocaleString("en-PH")} so far`;
    case "cancelled":
      return `Stopped after ${c.sentCount.toLocaleString("en-PH")}`;
    case "sent":
      return (
        `${c.sentCount.toLocaleString("en-PH")} sent` +
        (c.failedCount > 0 ? `, ${c.failedCount} failed and refunded` : "") +
        ` · ${c.creditsSpent.toLocaleString("en-PH")} credits` +
        (c.sentAt ? ` · ${fmt(c.sentAt)}` : "")
      );
    default:
      return c.status;
  }
}
