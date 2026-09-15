"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PARTNER_USER_ROLES, capabilitiesOf } from "@servd/core";
import {
  deactivateSeatAction,
  inviteSeatAction,
  revokeInviteAction,
  type TeamState,
} from "@/server/partners/team-actions";
import type { InviteRow, SeatRow } from "@/server/partners/team";

const initial: TeamState = { status: "idle" };

const ROLE_BLURB: Record<string, string> = {
  admin: "Everything, including revenue, pricing, brand and this page.",
  ops_manager:
    "Runs the team and the merchant book. No revenue, no pricing, no brand, and cannot edit permissions.",
  sales: "Pipeline and opening merchant accounts. No money, no brand, no team.",
  support: "Looks after merchants that already exist. Cannot change what anyone is charged.",
};

export function TeamManager({ seats, invites }: { seats: SeatRow[]; invites: InviteRow[] }) {
  const [state, invite, pending] = useActionState(inviteSeatAction, initial);
  const [revokeState, revoke] = useActionState(revokeInviteAction, initial);
  const [seatState, deactivate] = useActionState(deactivateSeatAction, initial);
  const field =
    "min-h-[44px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm outline-none focus:border-brand-ink";

  return (
    <>
      <section className="mt-6 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-ink/10 text-left text-xs uppercase tracking-wide text-brand-ink/45">
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-ink/[0.07]">
            {seats.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">
                  {/* The row is the way into the staff record now: the profile,
                      the book they are carrying, their activity, and
                      offboarding. */}
                  <Link href={`/partner/team/staff/${s.id}`} className="block font-semibold hover:underline">
                    {s.name ?? s.email}
                  </Link>
                  {s.name && <span className="block text-xs text-brand-ink/45">{s.email}</span>}
                </td>
                <td className="px-4 py-3 text-brand-ink/60">{s.role}</td>
                <td className="px-4 py-3 text-brand-ink/60">{s.status}</td>
                <td className="px-4 py-3 text-right">
                  {/* Deactivate is the blunt version and stays: it stops a
                      login now. Offboarding — deactivate AND hand the book over
                      AND sign them out — lives on the staff record, because it
                      needs to ask who is taking the work. */}
                  <Link
                    href={`/partner/team/staff/${s.id}`}
                    className="mr-3 text-xs font-semibold text-brand-primary hover:underline"
                  >
                    Open
                  </Link>
                  {s.status === "active" && (
                    <form action={deactivate} className="inline">
                      <input type="hidden" name="seatId" value={s.id} />
                      <button className="text-xs font-semibold text-guava hover:underline">
                        Deactivate
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {seatState.status === "error" && (
        <p role="alert" className="mt-2 text-sm text-guava">
          {seatState.message}
        </p>
      )}
      {seatState.status === "done" && (
        <p className="mt-2 text-sm text-brand-primary">{seatState.message}</p>
      )}

      {invites.length > 0 && (
        <section className="mt-6">
          <h2 className="font-heading text-lg font-bold">Pending invites</h2>
          <ul className="mt-2 divide-y divide-brand-ink/[0.07] overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold">{i.email}</span>
                  <span className="block text-xs text-brand-ink/45">
                    {i.role} · {i.expired ? "expired" : `expires ${i.expiresAt.toLocaleDateString()}`}
                  </span>
                </span>
                <form action={revoke}>
                  <input type="hidden" name="inviteId" value={i.id} />
                  <button className="text-xs font-semibold text-guava hover:underline">
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
          {revokeState.status === "error" && (
            <p role="alert" className="mt-2 text-sm text-guava">
              {revokeState.message}
            </p>
          )}
        </section>
      )}

      <form action={invite} className="mt-6 rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Invite someone</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            name="email"
            type="email"
            required
            placeholder="them@example.com"
            className={field}
          />
          <select name="role" defaultValue="sales" className={field}>
            {PARTNER_USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            disabled={pending}
            className="min-h-[44px] rounded-full bg-brand-ink px-6 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Inviting…" : "Invite"}
          </button>
        </div>

        <ul className="mt-4 space-y-1.5 text-xs text-brand-ink/55">
          {PARTNER_USER_ROLES.map((r) => (
            <li key={r}>
              <strong className="font-semibold text-brand-ink/75">{r}</strong> — {ROLE_BLURB[r]}{" "}
              <span className="text-brand-ink/35">({capabilitiesOf(r).length} permissions)</span>
            </li>
          ))}
        </ul>

        {state.status === "error" && (
          <p role="alert" className="mt-3 rounded-lg bg-guava/10 px-3 py-2 text-sm text-guava">
            {state.message}
          </p>
        )}
        {state.status === "invited" && (
          <div className="mt-3 rounded-lg border border-brand-primary/25 bg-brand-primary/[0.04] p-4">
            <p className="text-sm font-semibold">Invite created for {state.email}</p>
            <p className="mt-1 text-xs text-brand-ink/60">
              {/*
                Handed over rather than emailed. This deployment cannot send
                mail yet, and an invite that silently goes nowhere is worse than
                one the admin passes on themselves. Shown ONCE — the database
                stores only a hash of it.
              */}
              We can&rsquo;t email this yet, so send it to them yourself. It is shown once —
              we only keep a hash.
            </p>
            <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-xs">
              {state.token}
            </code>
          </div>
        )}
      </form>
    </>
  );
}
