"use client";

import { useActionState } from "react";
import {
  saveSmsSettingsAction,
  type SmsSettingsState,
} from "@/server/partners/sms-settings-actions";

/** "09:00" → 540. The form posts a time; the column stores minutes. */
function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * The settings that decide how this partner's texts behave.
 *
 * ALL THREE AUTOMATIONS ARE OFF UNTIL SOMEBODY WRITES THE MESSAGE. There is no
 * house copy that goes out under a partner's name: the text is theirs, and a
 * default we wrote would be a sentence their customers attribute to them.
 */
export function SmsSettings({
  settings,
}: {
  settings: {
    senderName: string;
    senderStatus: string;
    optOutText: string;
    optOutPlaceholder: string;
    windowStart: string;
    windowEnd: string;
    capCount: number;
    capDays: number;
    autoWelcome: boolean;
    autoWelcomeText: string;
    autoVisitDays: number;
    autoVisitText: string;
    autoTrialDays: number;
    autoTrialText: string;
  };
}) {
  const [state, save, saving] = useActionState<SmsSettingsState, FormData>(
    saveSmsSettingsAction,
    null,
  );
  const field =
    "min-h-[44px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm outline-none focus:border-brand-ink";
  const area = "w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm";

  return (
    <form
      action={(fd) => {
        // The two time inputs become minutes here rather than on the server, so
        // the column and the control cannot drift apart.
        fd.set("windowStart", String(toMinutes(String(fd.get("windowStartTime") ?? "09:00"))));
        fd.set("windowEnd", String(toMinutes(String(fd.get("windowEndTime") ?? "20:00"))));
        return save(fd);
      }}
      className="space-y-5"
    >
      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Sender name</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <input
            name="senderName"
            defaultValue={settings.senderName}
            maxLength={11}
            placeholder="CANVEXIA"
            className={field}
          />
          <span className="text-xs font-semibold text-brand-ink/55">
            {settings.senderStatus === "approved"
              ? "Approved — your texts go out under this name"
              : settings.senderStatus === "pending"
                ? "Waiting on the network — texts go out as CANVEXIA meanwhile"
                : settings.senderStatus === "rejected"
                  ? "Rejected by the network — texts go out as CANVEXIA"
                  : "Not set — texts go out as CANVEXIA"}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-brand-ink/45">
          Registering a sender name with the network is done by hand and takes a few days.
          Changing it here starts that again, and texts go out under CANVEXIA until it is
          approved — an unregistered name is rejected by the network, not by us.
        </p>
      </section>

      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Opt-out wording</p>
        <input
          name="optOutText"
          defaultValue={settings.optOutText}
          maxLength={160}
          placeholder={settings.optOutPlaceholder}
          className={`${field} mt-3`}
        />
        {/* The one sentence on this page that is a legal requirement rather
            than a preference. */}
        <p className="mt-2 text-xs leading-relaxed text-brand-ink/45">
          Added to the end of every marketing text. You can word it however your contacts
          read best — Tagalog is fine — but it cannot be removed. Leave it blank to use
          &ldquo;{settings.optOutPlaceholder}&rdquo;.
        </p>
      </section>

      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">When you may text</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-xs font-semibold text-brand-ink/60">
            From
            <input
              name="windowStartTime"
              type="time"
              defaultValue={settings.windowStart}
              className={`${field} mt-1`}
            />
          </label>
          <label className="text-xs font-semibold text-brand-ink/60">
            Until
            <input
              name="windowEndTime"
              type="time"
              defaultValue={settings.windowEnd}
              className={`${field} mt-1`}
            />
          </label>
          <label className="text-xs font-semibold text-brand-ink/60">
            Max texts per person
            <input
              name="capCount"
              type="number"
              min={0}
              max={20}
              defaultValue={settings.capCount}
              className={`${field} mt-1`}
            />
          </label>
          <label className="text-xs font-semibold text-brand-ink/60">
            Per how many days
            <input
              name="capDays"
              type="number"
              min={1}
              max={90}
              defaultValue={settings.capDays}
              className={`${field} mt-1`}
            />
          </label>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-brand-ink/45">
          Manila time. A campaign started outside the window waits for the next slot rather
          than going out late. Replies to someone who texted you in the last day are exempt
          — they are awake and waiting for an answer.
        </p>
      </section>

      <section className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Automatic texts</p>
        <p className="mt-1 text-xs text-brand-ink/50">
          All off until you write the message. They obey consent, the window and the limit
          above, exactly as a campaign does.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                name="autoWelcome"
                defaultChecked={settings.autoWelcome}
                className="h-4 w-4 rounded border-brand-ink/25"
              />
              Welcome, when somebody ticks the box on your enquiry form
            </label>
            <textarea
              name="autoWelcomeText"
              rows={2}
              defaultValue={settings.autoWelcomeText}
              placeholder="Salamat {name}! We'll be in touch about {business_name}."
              className={`${area} mt-2`}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold">
              Follow-up, this many days after a visit that didn&rsquo;t sign
              <input
                name="autoVisitDays"
                type="number"
                min={0}
                max={60}
                defaultValue={settings.autoVisitDays}
                className={`${field} mt-1 sm:w-32`}
              />
            </label>
            <textarea
              name="autoVisitText"
              rows={2}
              defaultValue={settings.autoVisitText}
              placeholder="Hi {name}, still happy to answer any questions about getting {business_name} set up."
              className={`${area} mt-2`}
            />
            <p className="mt-1 text-xs text-brand-ink/40">0 turns it off.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold">
              Trial ending, this many days before
              <input
                name="autoTrialDays"
                type="number"
                min={0}
                max={60}
                defaultValue={settings.autoTrialDays}
                className={`${field} mt-1 sm:w-32`}
              />
            </label>
            <textarea
              name="autoTrialText"
              rows={2}
              defaultValue={settings.autoTrialText}
              placeholder="Hi {name}, your trial ends soon. Reply here if you'd like a hand."
              className={`${area} mt-2`}
            />
          </div>
        </div>
      </section>

      {state?.error && (
        <p role="alert" className="text-sm text-guava">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-brand-primary">{state.message}</p>}

      <button
        disabled={saving}
        className="min-h-[44px] rounded-full bg-brand-ink px-6 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
