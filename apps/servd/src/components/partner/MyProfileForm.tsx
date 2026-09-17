"use client";

import { useActionState } from "react";
import { updateMyProfile, type ProfileState } from "@/server/partners/profile-actions";

const FIELD = "mt-1 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-brand-ink/50";

/**
 * A seat's own details.
 *
 * Deliberately short. What is here is what somebody else needs in order to
 * reach this person, plus the emergency contact their operator needs if
 * something happens in the field. Role, status and email are shown beside it
 * and are NOT editable — those are the access control on this account, and a
 * self-service form that could touch them would be a privilege escalation with
 * a friendly label.
 */
export function MyProfileForm({
  name,
  mobile,
  emergencyName,
  emergencyMobile,
}: {
  name: string;
  mobile: string | null;
  emergencyName: string | null;
  emergencyMobile: string | null;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateMyProfile, null);

  return (
    <form action={action} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Your name
          <input name="name" defaultValue={name} required maxLength={120} className={FIELD} />
        </label>
        <label className={LABEL}>
          Mobile
          <input
            name="mobile"
            defaultValue={mobile ?? ""}
            inputMode="tel"
            maxLength={40}
            placeholder="09xx xxx xxxx"
            className={FIELD}
          />
          {/*
            Said plainly, because it is the reason the field exists. The
            merchant page shows this number to whoever is looking after that
            shop, and until it is filled in that card reads "No mobile on their
            profile yet".
          */}
          <span className="mt-1 block font-normal normal-case tracking-normal text-brand-ink/45">
            Shown on every merchant you sign, so whoever has a problem can ring you.
          </span>
        </label>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-ink/40">
        In case of emergency
      </p>
      <p className="mb-2 text-xs text-brand-ink/45">
        Only your operator&rsquo;s admins can read this. It is not in the audit log and it is not
        shown to merchants.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Contact name
          <input
            name="emergencyName"
            defaultValue={emergencyName ?? ""}
            maxLength={120}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Contact mobile
          <input
            name="emergencyMobile"
            defaultValue={emergencyMobile ?? ""}
            inputMode="tel"
            maxLength={40}
            className={FIELD}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="text-sm text-brand-primary">{state.ok}</p>}
      </div>
    </form>
  );
}
