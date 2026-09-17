"use client";

import Link from "next/link";
import { useId, useState } from "react";

/**
 * A PASSWORD BOX YOU CAN SEE INTO, AND A WAY OUT WHEN YOU CANNOT.
 *
 * REPORTED — "in all the login details, add a show password and forgot
 * password." Three of the four doors into this deployment had one or the other
 * and not both: the partner form had the link and no toggle, HQ had the toggle
 * and no link (and no reset route to point at), and every screen that SETS a
 * password — accepting an invite, the reset page itself, signup, claiming a
 * build — made people type ten characters twice with no way to check either.
 *
 * One component, because four hand-rolled toggles is four places for the input
 * `id`, the `aria-pressed` and the right padding to drift.
 *
 * WHY A TOGGLE AT ALL. The argument against is shoulder-surfing. It is weaker
 * than it sounds on the devices this is used on — a phone held at arm's length
 * in a restaurant — and much weaker than the thing it trades against: a person
 * who cannot see what they typed retries, gets rate-limited, and asks for a
 * reset they did not need. It defaults to hidden and it is never remembered
 * between loads.
 *
 * `forgotHref` is omitted on the screens where it would be nonsense: you are
 * not forgetting a password you are in the middle of choosing.
 */
export function PasswordField({
  name = "password",
  label = "Password",
  forgotHref,
  required = true,
  minLength,
  autoComplete = "current-password",
  autoFocus,
  hint,
  value,
  onChange,
  inputClassName,
  labelClassName = "block text-xs font-semibold uppercase tracking-wide text-brand-ink/50",
  toggleClassName = "text-brand-ink/45 hover:text-brand-ink",
}: {
  name?: string;
  label?: string;
  /** Where "Forgot password?" goes. Omitted where there is nothing to forget. */
  forgotHref?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: "current-password" | "new-password";
  autoFocus?: boolean;
  hint?: string;
  /** Controlled use, for the two screens that already held their own state. */
  value?: string;
  onChange?: (value: string) => void;
  inputClassName?: string;
  labelClassName?: string;
  toggleClassName?: string;
}) {
  const [show, setShow] = useState(false);
  const id = useId();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={labelClassName}>
          {label}
        </label>
        {forgotHref && (
          <Link href={forgotHref} className="text-xs font-semibold text-brand-primary">
            Forgot password?
          </Link>
        )}
      </div>

      <div className="relative mt-1">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          {...(onChange ? { value: value ?? "", onChange: (e) => onChange(e.target.value) } : {})}
          // `pr-16` leaves room for the button. Without it the toggle sits on
          // top of the last characters of a long password — which is the exact
          // thing somebody turned it on to read.
          className={`w-full rounded-lg border px-3 py-2 pr-16 ${
            inputClassName ?? "border-brand-ink/15 text-sm"
          }`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          // Says what it DOES, not what it shows. A button reading "Show" with
          // a label of "Show" is read out twice and explains nothing.
          aria-label={show ? "Hide password" : "Show password"}
          className={`absolute inset-y-0 right-0 flex items-center px-3 text-xs font-semibold ${toggleClassName}`}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>

      {hint && <p className="mt-1 text-xs text-brand-ink/45">{hint}</p>}
    </div>
  );
}
