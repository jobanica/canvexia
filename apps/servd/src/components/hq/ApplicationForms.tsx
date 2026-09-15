"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  convertApplicationAction,
  setApplicationStatusAction,
  type ApplicationState,
} from "@/server/hq/applications-actions";

const idle: ApplicationState = { status: "idle" };

export function ApplicationStatus({
  id,
  current,
  notes,
}: {
  id: string;
  current: string;
  notes: string | null;
}) {
  const [state, formAction, pending] = useActionState(setApplicationStatusAction, idle);

  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <input type="hidden" name="id" value={id} />
      <h2 className="font-heading text-lg font-bold">Where this stands</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {["new", "contacted", "shortlisted", "rejected"].map((s) => (
          <label
            key={s}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-brand-ink/12 px-3 py-1.5 text-sm has-[:checked]:border-brand-primary has-[:checked]:bg-brand-primary/10 has-[:checked]:font-semibold has-[:checked]:text-brand-primary"
          >
            <input type="radio" name="status" value={s} defaultChecked={s === current} className="sr-only" />
            {s}
          </label>
        ))}
      </div>

      <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
        Notes — HQ only, never shown to the applicant
        <textarea
          name="notes"
          rows={3}
          defaultValue={notes ?? ""}
          className="mt-1 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
        />
      </label>

      <button
        disabled={pending}
        className="mt-3 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.status === "error" && <p className="mt-2 text-xs text-guava">{state.message}</p>}
      {state.status === "done" && (
        <p className="mt-2 text-xs text-brand-primary">{state.message}</p>
      )}
    </form>
  );
}

/**
 * Convert an application into a partner.
 *
 * The invite link comes back ONCE and is shown here. It is not in the audit
 * log, not in the email queue and not in the database — only its SHA-256 is —
 * so if HQ closes this without copying it, the answer is to resend from the
 * partner's team screen rather than to look it up.
 */
export function ConvertApplication({
  id,
  applicantName,
  city,
  territories,
  suggestedTerritoryId,
}: {
  id: string;
  applicantName: string;
  city: string;
  territories: { id: string; name: string; taken: boolean; assignable: boolean }[];
  suggestedTerritoryId: string | null;
}) {
  const [state, formAction, pending] = useActionState(convertApplicationAction, idle);
  const [tier, setTier] = useState<"operator" | "reseller">("operator");
  const [copied, setCopied] = useState(false);

  if (state.status === "converted") {
    return (
      <div className="rounded-tile border border-brand-primary/30 bg-brand-primary/[0.04] p-5">
        <h2 className="font-heading text-lg font-bold">{state.message}</h2>

        <p className="mt-3 text-sm font-semibold">Their invitation token</p>
        {/*
          A TOKEN, NOT A LINK, and deliberately so: there is no acceptance
          route in this codebase yet — the partner portal's own Team screen
          hands over a bare token for the same reason. Printing a
          /partner/accept/… URL here would look finished and 404.
        */}
        <p className="mt-1 text-xs text-brand-ink/60">
          Shown once — the database keeps only a hash. There is no self-serve acceptance page
          yet, so pass this to them with their sign-in instructions. If you lose it, reissue the
          invitation from the partner&rsquo;s Team screen.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-brand-ink/15 bg-white px-3 py-2 text-xs">
            {state.inviteToken}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(state.inviteToken);
              setCopied(true);
            }}
            className="rounded-full border border-brand-ink/15 bg-white px-3 py-2 text-xs font-semibold"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="mt-3 text-xs text-brand-ink/55">
          {state.emailQueued
            ? "A welcome email is queued and has NOT gone out: CREDENTIALS_ENCRYPTION_KEY is unset on this project, so email cannot be configured. It sends the day that changes."
            : "No welcome email was queued. Contact them yourself."}
        </p>

        <Link
          href={`/hq/partners/${state.partnerId}`}
          className="mt-4 inline-block rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
        >
          Open the partner
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <input type="hidden" name="id" value={id} />
      <h2 className="font-heading text-lg font-bold">Make them a partner</h2>
      <p className="mt-1 text-sm text-brand-ink/55">
        Creates the account, an admin seat, an invitation and the territory assignment — all in one
        transaction, so a half-made partner is not a state this can end in.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Partner name
          <input
            name="partnerName"
            defaultValue={applicantName}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Territory
          <select
            name="territoryId"
            defaultValue={suggestedTerritoryId ?? ""}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="">No territory yet</option>
            {territories.map((t) => (
              <option key={t.id} value={t.id} disabled={t.taken || !t.assignable}>
                {t.name}
                {t.taken ? " — taken" : !t.assignable ? " — split" : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block font-normal text-brand-ink/45">
            They applied for {city}.
          </span>
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Tier
          <select
            name="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as "operator" | "reseller")}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="operator">Operator — revenue share</option>
            <option value="reseller">Reseller — legacy, no cut</option>
          </select>
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Their share (%)
          <input
            name="revenueSharePct"
            type="number"
            min={0}
            max={100}
            defaultValue={70}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
          {tier === "operator" && (
            <span className="mt-1 block font-normal text-brand-ink/45">
              70 is standard. An operator on 0% earns CANVEXIA nothing, forever, with nothing to
              say so — the form refuses it.
            </span>
          )}
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Who collects
          <select
            name="collectionMode"
            defaultValue="partner_collects"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="partner_collects">The partner collects; HQ invoices its share</option>
            <option value="hq_collects">HQ collects and pays the partner out</option>
          </select>
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Licence starts
          <input
            name="licenseStartedAt"
            type="date"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
          <span className="mt-1 block font-normal text-brand-ink/45">
            Blank means today. Milestones are counted from this date.
          </span>
        </label>
      </div>

      <button
        disabled={pending}
        className="mt-4 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Creating…" : "Create the partner"}
      </button>
      {state.status === "error" && <p className="mt-2 text-xs text-guava">{state.message}</p>}
    </form>
  );
}
