"use client";

import { useActionState } from "react";
import { updateReputationSettings, type FormState } from "@/server/feedback/settings";
import { SubmitButton } from "./SubmitButton";

export function ReputationSettingsForm({
  initial,
}: {
  initial: { googleReviewUrl: string; feedbackMode: "on_device" | "follow_up" | "both" };
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updateReputationSettings,
    null,
  );

  return (
    <form
      action={action}
      className="max-w-xl space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5"
    >
      <div>
        <label className="block text-sm font-semibold">Google review link</label>
        <input
          name="googleReviewUrl"
          type="url"
          defaultValue={initial.googleReviewUrl}
          placeholder="https://g.page/r/…/review"
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        />
        <p className="mt-1 text-xs text-plum-ink/50">
          Shown to every diner after they rate — regardless of their stars.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold">When to ask for feedback</legend>
        <div className="mt-2 space-y-2 text-sm">
          {(
            [
              ["on_device", "On the table device, right after payment"],
              ["follow_up", "As a follow-up SMS later (post-MVP)"],
              ["both", "Both"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="feedbackMode"
                value={value}
                defaultChecked={initial.feedbackMode === value}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
          Compliance: the Google review invite is offered to ALL diners equally.
          Servd never routes only happy diners to Google (review gating is
          prohibited).
        </p>
      </fieldset>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
