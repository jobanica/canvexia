"use client";

import { useActionState } from "react";
import {
  issuePreviewLogin,
  endPreviewLogin,
  type PreviewLoginState,
} from "@/server/storefront-demo/actions";
import { expiryLabel, PREVIEW_LOGIN_DAYS } from "@/lib/preview-login/expiry";
import { CopyValue } from "@/components/super-admin/CopyValue";

/**
 * Issue a throwaway merchant login so a prospect can watch an order arrive.
 *
 * The password is shown once, here, and never stored anywhere readable — same
 * as the one conversion hands over. So the panel has to make it obvious that
 * this is the moment to write it down.
 */
export function PreviewLoginPanel({
  restaurantId,
  existing,
}: {
  restaurantId: string;
  /** The login already on this storefront, if any. */
  existing: { username: string | null; expiresAt: string } | null;
}) {
  const [state, action, pending] = useActionState<PreviewLoginState, FormData>(
    issuePreviewLogin,
    null,
  );

  const issued = state && "ok" in state ? state : null;
  const error = state && "error" in state ? state.error : null;

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">
        Preview login
      </h2>
      <p className="mt-1 text-xs text-plum-ink/55">
        A temporary merchant login for showing this storefront to the owner. They scan the QR,
        order, and watch it land on the Incoming Orders screen. It opens nothing else, expires by
        itself after {PREVIEW_LOGIN_DAYS} days, and is removed automatically when this demo is
        converted to a real account.
      </p>

      {issued && (
        <div className="mt-3 rounded-lg border border-brand-primary/25 bg-brand-primary/5 p-3">
          <p className="text-xs font-semibold text-plum-ink/70">
            Copy these now — the password isn&apos;t shown again.
          </p>
          <div className="mt-2 space-y-1.5 font-mono text-sm">
            <CopyValue label="Username" value={issued.username} />
            <CopyValue label="Password" value={issued.password} />
          </div>
          <p className="mt-2 text-[11px] text-plum-ink/45">
            Sign in at /login, then open Incoming Orders. {expiryLabel(issued.expiresAt)}.
          </p>
        </div>
      )}

      {!issued && existing && (
        <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
          A preview login already exists
          {existing.username ? (
            <>
              {" "}
              (<span className="font-mono">{existing.username}</span>)
            </>
          ) : null}{" "}
          — <strong>{expiryLabel(existing.expiresAt)}</strong>. Issuing a new one replaces it, so
          the old password stops working.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={action}>
          <input type="hidden" name="id" value={restaurantId} />
          <button
            disabled={pending}
            className="rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Creating…" : existing ? "Issue a new login" : "Create preview login"}
          </button>
        </form>

        {existing && (
          <form action={endPreviewLogin}>
            <input type="hidden" name="id" value={restaurantId} />
            <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold hover:bg-cream">
              Revoke now
            </button>
          </form>
        )}

        {error && <span className="text-sm text-guava">{error}</span>}
      </div>
    </div>
  );
}
