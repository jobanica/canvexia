"use client";

import { useActionState } from "react";
import {
  addHqSeatAction,
  saveAnnouncementAction,
  setHqSeatStatusAction,
  type TeamState,
} from "@/server/hq/team-actions";

const idle: TeamState = { status: "idle" };

function Feedback({ state }: { state: TeamState }) {
  if (state.status === "idle") return null;
  return (
    <p className={`mt-2 text-xs ${state.status === "error" ? "text-guava" : "text-brand-primary"}`}>
      {state.message}
    </p>
  );
}

export function AddHqSeat() {
  const [state, formAction, pending] = useActionState(addHqSeatAction, idle);
  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <h2 className="font-heading text-lg font-bold">Add an HQ seat</h2>
      {/* Said plainly rather than hidden behind a form that looks like it
          creates an account. It creates the platform_admins row, not the
          Supabase user — the same step the bootstrap SQL describes. */}
      <p className="mt-1 text-sm text-brand-ink/55">
        Create them in Supabase first (Authentication → Users), then paste their id here. This adds
        the HQ record; it does not create the login.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Email
          <input name="email" type="email" required className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Name
          <input name="displayName" className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70 sm:col-span-2">
          Supabase user id
          <input
            name="authUserId"
            required
            placeholder="00000000-0000-0000-0000-000000000000"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 font-mono text-xs"
          />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Role
          <select name="role" defaultValue="ops" className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm">
            <option value="ops">Ops — everything except money, suspension and this screen</option>
            <option value="super_admin">Super admin — everything</option>
          </select>
        </label>
      </div>

      <button disabled={pending} className="mt-3 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {pending ? "Adding…" : "Add"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SeatStatus({ id, email, active }: { id: string; email: string; active: boolean }) {
  const [state, formAction, pending] = useActionState(setHqSeatStatusAction, idle);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="deactivate" value={active ? "yes" : "no"} />
      <button
        disabled={pending}
        title={active ? `Stop ${email} signing in` : `Let ${email} sign in again`}
        className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-40 ${
          active ? "border-guava/40 text-guava" : "border-brand-ink/15"
        }`}
      >
        {pending ? "…" : active ? "Deactivate" : "Reactivate"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function AnnouncementForm({ products }: { products: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(saveAnnouncementAction, idle);
  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <h2 className="font-heading text-lg font-bold">Write an announcement</h2>

      <div className="mt-3 grid gap-3">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Title
          <input name="title" required className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Body — Markdown
          <textarea name="body" rows={6} required className="mt-1 w-full rounded-lg border border-brand-ink/15 px-3 py-2 font-mono text-xs" />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Level
          <select name="level" defaultValue="info" className="mt-1 min-h-[40px] rounded-lg border border-brand-ink/15 px-3 text-sm">
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="incident">Incident</option>
          </select>
        </label>
      </div>

      <fieldset className="mt-4 rounded-xl border border-brand-ink/12 p-4">
        <legend className="px-1 text-xs font-semibold text-brand-ink/70">Who sees it</legend>
        {/* Nothing ticked means everybody — a UI with no checkboxes ticked reads
            as "no filter on this axis", not "match nothing". */}
        <p className="text-xs text-brand-ink/50">Tick nothing to send it to every partner.</p>

        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-brand-ink/70">Tier</p>
            {["operator", "reseller"].map((t) => (
              <label key={t} className="mt-1 flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="tier" value={t} />
                {t}
              </label>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-ink/70">Status</p>
            {["approved", "pending", "suspended"].map((s) => (
              <label key={s} className="mt-1 flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="segmentStatus" value={s} />
                {s}
              </label>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-ink/70">Product enabled</p>
            {products.map((p) => (
              <label key={p.id} className="mt-1 flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="productId" value={p.id} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="mt-4 flex flex-wrap items-end gap-3">
        <legend className="sr-only">When</legend>
        {[
          ["draft", "Save as a draft"],
          ["now", "Publish now"],
          ["schedule", "Schedule"],
        ].map(([v, label]) => (
          <label key={v} className="flex items-center gap-1.5 text-sm">
            <input type="radio" name="publish" value={v} defaultChecked={v === "draft"} />
            {label}
          </label>
        ))}
        <label className="text-xs font-semibold text-brand-ink/70">
          At (Manila)
          <input type="datetime-local" name="scheduledFor" className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm" />
        </label>
      </fieldset>

      <button disabled={pending} className="mt-4 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {pending ? "Saving…" : "Save"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
