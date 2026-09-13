"use client";

import { useActionState } from "react";
import { saveXenditSettings, type ActionState } from "@/server/billing/super-admin-actions";

export function XenditForm({ configured, webhookUrl }: { configured: boolean; webhookUrl: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveXenditSettings, null);
  const input = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-plum-ink/45";

  return (
    <form action={action} className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${configured ? "bg-mango" : "bg-plum-ink/20"}`} />
        <span className="text-sm font-semibold">
          {configured ? "Xendit is connected" : "Xendit not connected"}
        </span>
      </div>

      <div>
        <label className={label}>Xendit secret API key</label>
        <input
          name="secretKey"
          type="password"
          autoComplete="off"
          placeholder={configured ? "•••••••• (enter to replace)" : "xnd_production_…"}
          className={input}
        />
        <p className="mt-1 text-xs text-plum-ink/45">
          Xendit Dashboard → Settings → API Keys → Secret key.
        </p>
      </div>

      <div>
        <label className={label}>Webhook callback token</label>
        <input
          name="callbackToken"
          type="password"
          autoComplete="off"
          placeholder={configured ? "•••••••• (enter to replace)" : "Your verification token"}
          className={input}
        />
        <p className="mt-1 text-xs text-plum-ink/45">
          Xendit Dashboard → Settings → Webhooks → Verification token.
        </p>
      </div>

      <div className="rounded-lg bg-cream/70 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-plum-ink/45">Webhook URL</p>
        <p className="mt-1 break-all text-sm font-medium text-plum-ink">{webhookUrl}</p>
        <p className="mt-1 text-xs text-plum-ink/50">
          In Xendit → Settings → Webhooks, set the <strong>Invoices paid</strong> URL to the above.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60">
          {pending ? "Saving…" : "Save & connect Xendit"}
        </button>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="text-sm text-mango">{state.message}</p>}
      </div>
    </form>
  );
}
