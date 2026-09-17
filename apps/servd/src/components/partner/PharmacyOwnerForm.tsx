"use client";

import { useActionState, useState } from "react";
import {
  createPharmacyOwnerAction,
  resetPharmacyOwnerAction,
  type OwnerState,
} from "@/server/partners/pharmacy-actions";

const IDLE: OwnerState = { status: "idle" };
const FIELD = "mt-1 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-brand-ink/50";

/**
 * THE OWNER'S LOGIN, HANDED OVER STANDING IN THE SHOP.
 *
 * REPORTED — "I activated it, but I cannot see the login details of the
 * account." There were none. A pharmacy could be signed, provisioned and
 * activated from this portal and the first account at it came from a CLI run by
 * whoever holds the service-role key.
 *
 * `hasStaff` IS A PROP, NEVER A REASON THE PARENT SKIPS RENDERING THIS.
 *
 * That rule is written in blood on the Servd side: the convert form was mounted
 * as `{!login.converted && <Form/>}`, a server action re-renders the page's
 * server tree when it finishes, the successful conversion set `converted` true,
 * React unmounted the component — and took with it the `useActionState` that was
 * the only place the password had ever existed. A real merchant was left with a
 * credential nobody had. So: the credentials are shown FIRST, before this
 * component consults any prop about whether the job is already done.
 */
export function PharmacyOwnerForm({
  pharmacyId,
  hasStaff,
  ownerEmail,
}: {
  pharmacyId: string;
  /** Somebody is already staff here. Consulted AFTER any credentials in hand. */
  hasStaff: boolean;
  ownerEmail: string | null;
}) {
  const [state, action, pending] = useActionState(createPharmacyOwnerAction, IDLE);
  const [reset, resetAction, resetting] = useActionState(resetPharmacyOwnerAction, IDLE);

  // Whichever of the two produced credentials. Read before `hasStaff`, always.
  const shown = state.status === "done" ? state : reset.status === "done" ? reset : null;
  if (shown) return <Credentials shown={shown} />;

  if (hasStaff) {
    return (
      <div className="mt-8 rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">The owner has their login</p>
        <p className="mt-1 text-sm text-brand-ink/55">
          {ownerEmail ? (
            <>
              They sign in as <span className="font-semibold text-brand-ink">{ownerEmail}</span>.
              More staff are added from inside Resceta, under Staff.
            </>
          ) : (
            <>Somebody is already staff here. More are added from inside Resceta, under Staff.</>
          )}
        </p>

        {/*
          THE PASSWORD IS SHOWN ONCE AND STORED NOWHERE — not here, not in the
          database, not in a log. Without this button an owner who closed the
          page before copying it is locked out, and "use Forgot password" only
          helps if they can receive mail at that address.
        */}
        <form action={resetAction} className="mt-3">
          <input type="hidden" name="pharmacyId" value={pharmacyId} />
          <button
            disabled={resetting}
            className="rounded-full border border-brand-ink/15 px-4 py-2 text-xs font-semibold text-brand-ink/70 disabled:opacity-40"
          >
            {resetting ? "Resetting…" : "Issue a new password"}
          </button>
        </form>
        {reset.status === "error" && (
          <p className="mt-2 text-xs text-guava">{reset.message}</p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 rounded-tile border border-brand-ink/10 bg-white p-5">
      <input type="hidden" name="pharmacyId" value={pharmacyId} />
      <p className="text-sm font-semibold">Give the owner their login</p>
      <p className="mt-1 text-sm text-brand-ink/55">
        Nobody can sign in to this pharmacy yet. Use the owner&rsquo;s real email address —
        it is how they reset their own password later.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Owner&rsquo;s email
          <input name="email" type="email" required className={FIELD} />
        </label>
        <label className={LABEL}>
          Their name
          <input name="name" maxLength={120} className={FIELD} />
        </label>
      </div>

      <button
        disabled={pending}
        className="mt-4 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Creating…" : "Create the owner's login"}
      </button>
      {state.status === "error" && <p className="mt-2 text-sm text-guava">{state.message}</p>}
    </form>
  );
}

function Credentials({
  shown,
}: {
  shown: { credentials: { email: string; password: string }; signInUrl: string };
}) {
  const [copied, setCopied] = useState(false);
  const { email, password } = shown.credentials;

  return (
    <div className="mt-8 rounded-tile border border-brand-primary/30 bg-brand-primary/[0.04] p-5">
      <p className="font-heading text-lg font-bold">Their login</p>
      {/*
        SHOWN ONCE. The password exists in this response and nowhere else — the
        database stores Supabase's hash and this portal stores nothing. Saying
        so is what stops somebody closing the tab expecting to find it later.
      */}
      <p className="mt-1 text-sm text-brand-ink/60">
        Read this out now. The password is not stored anywhere and this is the only time it is
        shown — you can issue a new one from this page if it is lost.
      </p>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
            Sign in at
          </dt>
          <dd>
            <a
              href={shown.signInUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brand-primary underline"
            >
              {shown.signInUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">Email</dt>
          <dd className="font-semibold">{email}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
            Password
          </dt>
          <dd className="break-all font-mono text-base font-semibold">{password}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(
            `${shown.signInUrl}\nEmail: ${email}\nPassword: ${password}`,
          );
          setCopied(true);
        }}
        className="mt-4 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white"
      >
        {copied ? "Copied" : "Copy all three"}
      </button>
    </div>
  );
}
