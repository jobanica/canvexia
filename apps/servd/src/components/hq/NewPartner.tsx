"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createPartnerAction, type ApplicationState } from "@/server/hq/applications-actions";

const idle: ApplicationState = { status: "idle" };

/**
 * ADD A PARTNER HQ SIGNED THEMSELVES.
 *
 * REPORTED — "in the partners section in HQ, i dont have an option to create a
 * partner." There wasn't one. A partner could only be made by converting an
 * application, and applications only arrive from canvexia.com's form, so a
 * partner signed over coffee could not be entered at all.
 *
 * COLLAPSED BY DEFAULT, opened by a button. This page is a list somebody reads
 * far more often than a form they fill in, and a nine-field form above the
 * table pushes the partners down the screen every single visit.
 *
 * It keeps its own success state rather than unmounting on the action's
 * re-render, for the same reason PartnerConvertForm does: the invite token is
 * returned ONCE and lives only in this component's state. A parent that decided
 * whether to render this based on something the action changes would unmount it
 * mid-reveal and take the token with it.
 */
export function NewPartner({
  territories,
}: {
  territories: { id: string; name: string; taken: boolean; assignable: boolean }[];
}) {
  const [state, formAction, pending] = useActionState(createPartnerAction, idle);
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<"operator" | "reseller">("operator");
  const [copied, setCopied] = useState(false);

  if (state.status === "converted") {
    return (
      <div className="mb-5 rounded-tile border border-brand-primary/30 bg-brand-primary/[0.04] p-5">
        <h2 className="font-heading text-lg font-bold">{state.message}</h2>

        <p className="mt-3 text-sm font-semibold">Their invitation token</p>
        <p className="mt-1 text-xs text-brand-ink/60">
          Shown once — the database keeps only a hash. There is no self-serve acceptance page yet,
          so pass this to them with their sign-in instructions. If you lose it, reissue the
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
            ? "A welcome email is QUEUED and has not gone out — nothing drains the queue yet. Send them the token above yourself for now."
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

  if (!open) {
    return (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-tile border border-brand-ink/10 bg-white px-5 py-4">
        <p className="text-sm text-brand-ink/60">
          Signed somebody who never applied through the website?
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          Add a partner
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mb-5 rounded-tile border border-brand-ink/10 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Add a partner</h2>
          <p className="mt-1 text-sm text-brand-ink/55">
            Creates the account, an admin seat, an invitation and the territory assignment — all in
            one transaction, so a half-made partner is not a state this can end in.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-full border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold text-brand-ink/60"
        >
          Cancel
        </button>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-ink/40">
        Who they are
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Contact&rsquo;s full name
          <input
            name="fullName"
            required
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Business name
          <input
            name="partnerName"
            placeholder="Blank uses the contact's name"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
          <span className="mt-1 block font-normal text-brand-ink/45">
            What the portal and their merchants&rsquo; invoices will say.
          </span>
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
          <span className="mt-1 block font-normal text-brand-ink/45">
            This is the login for their admin seat, and it has to be unique.
          </span>
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Mobile
          <input
            name="mobile"
            required
            inputMode="tel"
            placeholder="09xx xxx xxxx"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          City
          <input
            name="city"
            required
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Province
          <input
            name="province"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-ink/40">
        The terms
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Territory
          <select
            name="territoryId"
            defaultValue=""
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
            Can be assigned later from Territories.
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
              70 is standard — they keep 70%, CANVEXIA keeps 30%. An operator on 0% earns CANVEXIA
              nothing, forever, with nothing to say so; the form refuses it.
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
        className="mt-5 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Creating…" : "Create the partner"}
      </button>
      {state.status === "error" && <p className="mt-2 text-xs text-guava">{state.message}</p>}
    </form>
  );
}
