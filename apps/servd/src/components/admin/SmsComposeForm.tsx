"use client";

import { useState } from "react";
import { sendCampaign } from "@/server/sms/campaigns";

export function SmsComposeForm({
  confirmedCount,
  credits,
  canSend,
}: {
  confirmedCount: number;
  credits: number;
  canSend: boolean;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSend() {
    if (!confirm(`Send to ${confirmedCount} confirmed subscriber(s)?`)) return;
    setBusy(true);
    setResult(null);
    const res = await sendCampaign({ body });
    setBusy(false);
    if (res.ok) {
      setResult(`Sent ${res.sent}, failed ${res.failed}.`);
      setBody("");
    } else {
      setResult(res.error ?? "Couldn't send.");
    }
  }

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h2 className="font-heading text-lg font-bold">New campaign</h2>
      <p className="text-sm text-plum-ink/50">
        Goes only to {confirmedCount} confirmed subscriber(s). Credits: {credits}.
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={600}
        placeholder="e.g. Weekend special: 10% off all rice meals! Show this text."
        className="mt-3 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-plum-ink/40">{body.length}/600</span>
        <button
          onClick={handleSend}
          disabled={busy || !body.trim() || !canSend || confirmedCount === 0}
          className="rounded-full px-5 py-2 text-sm font-semibold btn-brand disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send campaign"}
        </button>
      </div>
      {!canSend && (
        <p className="mt-2 text-xs text-guava">
          A registered sender name is required before sending — ask the platform
          admin.
        </p>
      )}
      {result && <p className="mt-2 text-sm text-plum-ink/70">{result}</p>}
    </div>
  );
}
