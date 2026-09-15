"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions";
import { HOURS_OPTIONS } from "@/lib/waitlist-input";
import { useCity } from "./city-context";
import { SITE } from "@/lib/site";

/**
 * Section 11 — the form the whole page exists for.
 *
 * A plain `<form action={...}>` with `useActionState`, so it submits and shows
 * its result without JavaScript having to manage a fetch. The city arrives
 * pre-filled when someone used the finder above (shared context), and the
 * submit button names the city back to them — the one bit of copy on this page
 * that is different for every visitor, which is what makes it feel answered
 * rather than collected.
 */
const initial: WaitlistState = { status: "idle" };

function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

const inputClass =
  "min-h-[52px] w-full rounded-lg border border-line bg-white px-4 text-base outline-none focus:border-ink";

export function WaitlistForm() {
  const [state, formAction, pending] = useActionState(joinWaitlist, initial);
  const { city, setCity } = useCity();
  const [localCity, setLocalCity] = useState("");
  const uid = useId();
  const doneRef = useRef<HTMLDivElement>(null);

  // The finder writes into the context; this mirrors it into the input, which
  // the applicant can still overtype.
  useEffect(() => {
    if (city) setLocalCity(city);
  }, [city]);

  // Move focus to the result so a screen reader — and a phone keyboard that
  // just collapsed — both land somewhere that makes sense.
  useEffect(() => {
    if (state.status === "done") doneRef.current?.focus();
  }, [state.status]);

  if (state.status === "done") {
    return (
      <div
        ref={doneRef}
        tabIndex={-1}
        className="rounded-xl border border-line bg-white p-8 outline-none sm:p-10"
      >
        <span className="rule-accent" aria-hidden="true" />
        <h3 className="mt-5 font-display text-2xl font-bold sm:text-3xl">
          {state.alreadyOn
            ? `You're already on the ${state.city} list.`
            : `You're on the list for ${state.city}.`}
        </h3>
        <p className="mt-4 text-base leading-relaxed text-ink-soft">
          You are{" "}
          <strong className="font-semibold text-ink">
            number {state.position}
          </strong>{" "}
          for {state.city}.{" "}
          {state.alreadyOn
            ? "We kept your first application rather than adding a second — nothing was lost."
            : "Nothing is owed and nothing is reserved yet."}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-ink-faint">
          We are not sending a confirmation email yet — when the partner system opens we
          contact everyone on the list, in order, by the mobile number you gave. If you
          want to talk sooner, email{" "}
          <a href={`mailto:${SITE.email}`} className="text-ink underline underline-offset-4">
            {SITE.email}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-xl border border-line bg-white p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor={`${uid}-name`}>
          <input
            id={`${uid}-name`}
            name="fullName"
            required
            maxLength={120}
            autoComplete="name"
            className={inputClass}
          />
        </Field>

        <Field label="Email" htmlFor={`${uid}-email`}>
          <input
            id={`${uid}-email`}
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            className={inputClass}
          />
        </Field>

        <Field label="Mobile" hint="0917 123 4567 or +63 917 123 4567" htmlFor={`${uid}-mobile`}>
          <input
            id={`${uid}-mobile`}
            name="mobile"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            // A PH mobile in any of the spellings the server accepts. The
            // server normalises and is the authority; this only saves a round
            // trip on an obvious typo.
            pattern="^(\+?63|0)?[\s\-().]*9[\s\-().0-9]{9,}$"
            className={inputClass}
          />
        </Field>

        <Field label="City you want to run" htmlFor={`${uid}-city`}>
          <input
            id={`${uid}-city`}
            name="city"
            required
            maxLength={120}
            autoComplete="address-level2"
            value={localCity}
            onChange={(e) => {
              setLocalCity(e.target.value);
              setCity(e.target.value);
            }}
            className={inputClass}
          />
        </Field>

        <Field label="Province" hint="Optional" htmlFor={`${uid}-province`}>
          <input
            id={`${uid}-province`}
            name="province"
            maxLength={120}
            autoComplete="address-level1"
            className={inputClass}
          />
        </Field>

        <Field label="What do you do now?" hint="Optional" htmlFor={`${uid}-work`}>
          <input
            id={`${uid}-work`}
            name="currentWork"
            maxLength={200}
            placeholder="Insurance agent, sari-sari store, OFW…"
            className={inputClass}
          />
        </Field>

        <Field label="Hours a week you can give this" htmlFor={`${uid}-hours`}>
          <select id={`${uid}-hours`} name="hoursPerWeek" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Choose one
            </option>
            {HOURS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="How did you hear about us?" hint="Optional" htmlFor={`${uid}-heard`}>
          <input id={`${uid}-heard`} name="howHeard" maxLength={200} className={inputClass} />
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold">Have you sold something before?</legend>
          <p className="mt-0.5 text-xs text-ink-faint">
            Anything — insurance, load, real estate, your own products. &ldquo;No&rdquo;
            does not disqualify you.
          </p>
          <div className="mt-3 flex gap-3">
            {[
              { v: "yes", l: "Yes" },
              { v: "no", l: "No" },
            ].map((o) => (
              <label
                key={o.v}
                className="flex min-h-[48px] flex-1 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 text-base has-[:checked]:border-ink has-[:checked]:bg-paper"
              >
                <input
                  type="radio"
                  name="soldBefore"
                  value={o.v}
                  required
                  className="h-4 w-4 accent-coral"
                />
                {o.l}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="What did you sell?" hint="Optional" htmlFor={`${uid}-soldwhat`}>
          <input id={`${uid}-soldwhat`} name="soldWhat" maxLength={300} className={inputClass} />
        </Field>
      </div>

      {state.status === "error" && (
        <p role="alert" className="mt-6 rounded-lg bg-coral/10 px-4 py-3 text-sm text-coral">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-7 inline-flex min-h-[52px] w-full items-center justify-center rounded-lg bg-ink px-6 text-[0.95rem] font-semibold text-paper transition-colors hover:bg-black disabled:opacity-60 sm:w-auto"
      >
        {pending
          ? "Adding you…"
          : localCity.trim()
            ? `Add me to the ${localCity.trim()} waitlist`
            : "Add me to the waitlist"}
      </button>

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        No fee, no commitment. We use your details to contact you about the partner
        programme and nothing else.
      </p>
    </form>
  );
}
