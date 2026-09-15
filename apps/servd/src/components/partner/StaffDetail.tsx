"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PartnerUserRole } from "@servd/core";
import type { StaffProfile, StaffBook, ActivityRow } from "@/server/partners/staff";
import {
  updateStaffProfileAction,
  assignSubjectAction,
  offboardStaffAction,
  reactivateStaffAction,
  type StaffState,
} from "@/server/partners/staff-actions";

const ROLE_LABELS: Record<PartnerUserRole, string> = {
  admin: "Admin",
  ops_manager: "Ops manager",
  sales: "Sales",
  support: "Support",
};

const TABS = ["Profile", "Assigned", "Activity"] as const;

/**
 * One staff member: record, book, activity.
 *
 * A client component only for the TABS — three panels behind links would be
 * three round trips to look at one person. Every write inside is still a server
 * action, so nothing here can change anything the server has not gated.
 */
export function StaffDetail({
  profile,
  book,
  activity,
  counts,
  colleagues,
  canEdit,
  canAssign,
  canSeeActivity,
  range,
}: {
  profile: StaffProfile;
  book: StaffBook;
  activity: ActivityRow[];
  counts: { kind: string; count: number }[];
  colleagues: { id: string; name: string | null; email: string; role: PartnerUserRole }[];
  canEdit: boolean;
  canAssign: boolean;
  canSeeActivity: boolean;
  range: { from: string; to: string };
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Profile");
  const [offboard, offboardAction] = useActionState<StaffState, FormData>(
    offboardStaffAction,
    null,
  );
  const inactive = profile.status !== "active";

  const tabs = TABS.filter((t) => t !== "Activity" || canSeeActivity);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-brand-ink/10">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === t
                ? "border-brand-primary text-brand-ink"
                : "border-transparent text-brand-ink/45 hover:text-brand-ink/70"
            }`}
          >
            {t}
            {t === "Assigned" && (
              <span className="ml-1.5 text-xs text-brand-ink/40">
                {book.merchants.length + book.prospects.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "Profile" && (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
            <form action={updateStaffProfileAction} className="grid gap-3">
              <input type="hidden" name="staffId" value={profile.id} />
              <Field label="Name" name="name" defaultValue={profile.name ?? ""} disabled={!canEdit} />
              <div>
                <span className="text-xs font-semibold text-brand-ink/50">Email</span>
                <p className="mt-1 text-sm">{profile.email}</p>
                <p className="mt-0.5 text-[0.68rem] text-brand-ink/40">
                  The sign-in address. Changing it means a new invitation.
                </p>
              </div>
              <Field label="Mobile" name="mobile" defaultValue={profile.mobile ?? ""} disabled={!canEdit} />
              <Field
                label="Zone or area"
                name="zone"
                defaultValue={profile.zone ?? ""}
                disabled={!canEdit}
                hint="Free text — whatever your team calls it."
              />
              <Field
                label="Start date"
                name="startDate"
                type="date"
                defaultValue={profile.startDate ? toDateInput(profile.startDate) : ""}
                disabled={!canEdit}
              />

              {profile.emergency && (
                <>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-ink/40">
                    Emergency contact
                  </p>
                  <p className="-mt-1 text-[0.68rem] text-brand-ink/40">
                    Only admins and ops managers can see this.
                  </p>
                  <Field
                    label="Name"
                    name="emergencyName"
                    defaultValue={profile.emergency.name ?? ""}
                    disabled={!canEdit}
                  />
                  <Field
                    label="Mobile"
                    name="emergencyMobile"
                    defaultValue={profile.emergency.mobile ?? ""}
                    disabled={!canEdit}
                  />
                </>
              )}

              {canEdit && (
                <button className="mt-1 justify-self-start rounded-full px-4 py-2 text-sm font-semibold btn-brand text-white">
                  Save
                </button>
              )}
            </form>
          </div>

          <div className="space-y-4">
            <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
              <p className="text-sm font-semibold">Seat</p>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Row k="Role" v={ROLE_LABELS[profile.role]} />
                <Row k="Status" v={inactive ? "Deactivated" : "Active"} />
                <Row
                  k="Joined"
                  v={profile.acceptedAt ? fmt(profile.acceptedAt) : "Invitation not accepted"}
                />
                <Row k="Last seen" v={profile.lastSeenAt ? fmt(profile.lastSeenAt) : "Never"} />
              </dl>
            </div>

            {canEdit && (
              <div className="rounded-tile border border-guava/25 bg-guava/[0.03] p-5">
                {inactive ? (
                  <>
                    <p className="text-sm font-semibold">Deactivated</p>
                    <p className="mt-1 text-sm text-brand-ink/55">
                      Their record and history are kept. Bringing them back does not return
                      the merchants and prospects that were handed over.
                    </p>
                    <form action={reactivateStaffAction} className="mt-3">
                      <input type="hidden" name="staffId" value={profile.id} />
                      <button className="rounded-full border border-brand-ink/15 bg-white px-4 py-2 text-sm font-semibold hover:bg-brand-surface">
                        Reactivate
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold">Offboard</p>
                    <p className="mt-1 text-sm text-brand-ink/55">
                      Deactivates the seat, hands everything they are carrying to somebody
                      else, and signs them out of every device. One step — it cannot half
                      happen.
                    </p>
                    <form action={offboardAction} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="staffId" value={profile.id} />
                      <label className="text-xs font-semibold text-brand-ink/50">
                        <span className="block">Hand their work to</span>
                        <select
                          name="reassignTo"
                          className="mt-1 rounded-lg border border-brand-ink/15 px-3 py-2 text-sm font-normal"
                        >
                          <option value="">Nobody — leave unassigned</option>
                          {colleagues
                            .filter((c) => c.id !== profile.id)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name ?? c.email} ({ROLE_LABELS[c.role]})
                              </option>
                            ))}
                        </select>
                      </label>
                      <button className="rounded-full bg-guava px-4 py-2 text-sm font-semibold text-white">
                        Offboard
                      </button>
                    </form>
                    {offboard?.error && (
                      <p className="mt-2 text-sm text-guava">{offboard.error}</p>
                    )}
                    {offboard?.ok && !offboard.error && (
                      <p className="mt-2 text-sm text-brand-primary">
                        Done. Their work has been handed over.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "Assigned" && (
        <div className="space-y-4">
          <Book
            title="Merchants"
            empty="No merchants assigned."
            rows={book.merchants.map((m) => ({
              id: m.id,
              productId: m.productId,
              label: m.name,
              meta: `${m.productName} · ${m.as}`,
              href: `/partner/merchants/${m.key}`,
              kind: "merchant" as const,
              as: m.as,
            }))}
            colleagues={colleagues}
            canAssign={canAssign}
          />
          <Book
            title="Prospects"
            empty="No prospects assigned."
            rows={book.prospects.map((p) => ({
              id: p.id,
              productId: "",
              label: p.businessName,
              meta: p.stage,
              href: "/partner/pipeline",
              kind: "prospect" as const,
              as: "sales" as const,
            }))}
            colleagues={colleagues}
            canAssign={canAssign}
          />
        </div>
      )}

      {tab === "Activity" && canSeeActivity && (
        <div className="space-y-4">
          <form className="flex flex-wrap items-end gap-2 rounded-tile border border-brand-ink/10 bg-white p-4">
            <label className="text-xs font-semibold text-brand-ink/50">
              <span className="block">From</span>
              <input
                type="date"
                name="from"
                defaultValue={range.from}
                className="mt-1 rounded-lg border border-brand-ink/15 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-brand-ink/50">
              <span className="block">To</span>
              <input
                type="date"
                name="to"
                defaultValue={range.to}
                className="mt-1 rounded-lg border border-brand-ink/15 px-3 py-2 text-sm font-normal"
              />
            </label>
            <button className="rounded-full border border-brand-ink/15 px-4 py-2 text-xs font-semibold hover:bg-brand-surface">
              Apply
            </button>
            <Link
              href={`/api/partner/staff/${profile.id}/activity.csv?from=${range.from}&to=${range.to}`}
              className="rounded-full border border-brand-ink/15 px-4 py-2 text-xs font-semibold hover:bg-brand-surface"
            >
              Export CSV
            </Link>
          </form>

          {counts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {counts.map((c) => (
                <span
                  key={c.kind}
                  className="rounded-full bg-brand-ink/5 px-3 py-1 text-xs font-semibold text-brand-ink/60"
                >
                  {c.kind.replace(/[._]/g, " ")} · {c.count}
                </span>
              ))}
            </div>
          )}

          <div className="rounded-tile border border-brand-ink/10 bg-white">
            {activity.length === 0 ? (
              <p className="p-5 text-sm text-brand-ink/50">
                Nothing in this range.
              </p>
            ) : (
              <ul className="divide-y divide-brand-ink/5">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{a.detail}</span>
                      <span className="text-[0.68rem] text-brand-ink/40">
                        {a.source === "audit" ? "changed something" : "logged it"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-brand-ink/45">{fmt(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Book({
  title,
  empty,
  rows,
  colleagues,
  canAssign,
}: {
  title: string;
  empty: string;
  rows: {
    id: string;
    productId: string;
    label: string;
    meta: string;
    href: string;
    kind: "merchant" | "prospect";
    as: "sales" | "support";
  }[];
  colleagues: { id: string; name: string | null; email: string; role: PartnerUserRole }[];
  canAssign: boolean;
}) {
  return (
    <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <p className="text-sm font-semibold">
        {title} <span className="text-brand-ink/40">({rows.length})</span>
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-brand-ink/50">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-brand-ink/5">
          {rows.map((r) => (
            <li key={`${r.kind}:${r.productId}:${r.id}`} className="flex flex-wrap items-center gap-3 py-2">
              <Link href={r.href} className="min-w-0 flex-1 truncate text-sm">
                {r.label}
              </Link>
              <span className="shrink-0 text-xs text-brand-ink/45">{r.meta}</span>
              {canAssign && (
                <form action={assignSubjectAction} className="flex shrink-0 items-center gap-1.5">
                  <input type="hidden" name="kind" value={r.kind} />
                  <input type="hidden" name="subjectId" value={r.id} />
                  <input type="hidden" name="productId" value={r.productId} />
                  <input type="hidden" name="as" value={r.as} />
                  <select
                    name="toUserId"
                    defaultValue=""
                    className="rounded-lg border border-brand-ink/15 px-2 py-1 text-xs"
                  >
                    <option value="">Move to…</option>
                    {colleagues.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name ?? c.email}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-lg border border-brand-ink/15 px-2.5 py-1 text-xs font-semibold hover:bg-brand-surface">
                    Move
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  disabled,
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  disabled: boolean;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-brand-ink/50">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm disabled:bg-brand-surface/60 disabled:text-brand-ink/50"
      />
      {hint && <span className="mt-0.5 block text-[0.68rem] text-brand-ink/40">{hint}</span>}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-brand-ink/50">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

const fmt = (d: Date | string) =>
  new Date(d).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });

const toDateInput = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
