"use client";

import { useActionState } from "react";
import { saveUploadPostKey } from "@/server/billing/super-admin-actions";
import type { ActionState } from "@/server/billing/super-admin-actions";
import { SubmitButton } from "@/components/admin/SubmitButton";

/** Platform-wide Upload-Post API key — powers every restaurant's scheduler. */
export function UploadPostForm({ configured }: { configured: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveUploadPostKey, null);
  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h2 className="font-heading text-lg font-bold">Social posting (Upload-Post)</h2>
      <p className="mt-1 text-sm text-plum-ink/55">
        One API key for the whole platform — each restaurant posts through its own profile under it.
        Powers the Content scheduler feature.{" "}
        {configured ? (
          <span className="font-semibold text-mango">Connected.</span>
        ) : (
          <span className="font-semibold text-plum-ink/70">Not configured.</span>
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-semibold text-plum-ink/60">API key</label>
          <input
            name="apiKey"
            type="password"
            placeholder={configured ? "•••••••• (leave blank to keep)" : "Your Upload-Post API key"}
            className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>
        <SubmitButton>Save</SubmitButton>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-mango">{state.message ?? "Saved."}</p>}
    </form>
  );
}
