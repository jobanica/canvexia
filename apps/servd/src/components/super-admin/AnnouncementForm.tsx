"use client";

import { useActionState, useRef, useEffect } from "react";
import { publishAnnouncement, type AnnouncementState } from "@/server/announcements/actions";

/**
 * Write a notice and send it to every restaurant.
 *
 * The level isn't cosmetic to the person reading it: "Incident" is what an
 * owner sees when their shop might be affected right now, so it's a deliberate
 * choice rather than a default that gets left alone.
 */
export function AnnouncementForm() {
  const [state, action, pending] = useActionState<AnnouncementState, FormData>(
    publishAnnouncement,
    null,
  );
  const form = useRef<HTMLFormElement>(null);

  // Clear the box on success — leaving the text there invites sending it twice.
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state?.ok]);

  const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <form ref={form} action={action} className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-5">
      <p className="font-heading text-lg font-bold">New announcement</p>
      <p className="text-sm text-plum-ink/55">
        Goes to every restaurant. A number appears on their Announcements button until they read
        it.
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block text-sm">
          <span className="font-medium">Title</span>
          <input name="title" required maxLength={120} placeholder="Printing issue fixed" className={field} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Level</span>
          <select name="level" className={field} defaultValue="info">
            <option value="info">Update</option>
            <option value="warning">Heads up</option>
            <option value="incident">Incident</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Message</span>
        <textarea
          name="body"
          required
          rows={5}
          maxLength={4000}
          placeholder={"What happened, what you did about it, and anything they need to do.\n\nPlain language — the person reading this is running a kitchen."}
          className={field}
        />
      </label>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Sent to all restaurants.</p>}

      <button
        disabled={pending}
        className="rounded-full px-5 py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send to all"}
      </button>
    </form>
  );
}
