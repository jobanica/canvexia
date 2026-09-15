import Link from "next/link";
import { notFound } from "next/navigation";
import { hqCan } from "@servd/core";
import { requireHqPage } from "@/server/hq/auth";
import { getPartnerDetail, maskedPayout } from "@/server/hq/partners";
import { HqShell } from "@/components/hq/HqShell";
import { peso } from "@/components/canvexia/Cards";
import {
  ApprovePartner,
  ExtendExclusivity,
  RevokeExclusivity,
  SuspendPartner,
  ViewAsPartner,
} from "@/components/hq/PartnerActions";

const TABS = ["profile", "merchants", "statements", "staff", "activity", "actions"] as const;
type Tab = (typeof TABS)[number];

function isTab(v: string): v is Tab {
  return (TABS as readonly string[]).includes(v);
}

function date(d: Date | null): string {
  return d ? d.toLocaleDateString("en-PH", { dateStyle: "medium" }) : "—";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-brand-ink/[0.06] py-2.5 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-brand-ink/45">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || <span className="text-brand-ink/30">—</span>}</dd>
    </div>
  );
}

/**
 * One partner, in tabs.
 *
 * TABS AS A QUERY PARAM, not client state. Every tab here is a server render
 * over data the page already has, and a link is shareable — "look at Cebu's
 * activity" is a URL somebody can paste into a message. It also means the back
 * button does what it looks like it does.
 *
 * NOTHING SECRET IS ON THIS PAGE. Payout account numbers never leave
 * server/hq/partners.ts; what reaches here is whether details exist and what
 * kind. See the note on `getPartnerDetail`.
 */
export default async function HqPartnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireHqPage("partners.read");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = await getPartnerDetail(id);
  if (!p) notFound();

  const tab: Tab = sp.tab && isTab(sp.tab) ? sp.tab : "profile";
  const canSuspend = hqCan(user.role, "partners.suspend");
  const canImpersonate = hqCan(user.role, "hq.impersonate");

  return (
    <HqShell
      user={user}
      title={p.name}
      subtitle={`${p.tier} · ${p.territory ?? "no territory"} · ${p.status}`}
      actions={
        <Link
          href="/hq/partners"
          className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface"
        >
          All partners
        </Link>
      }
    >
      <nav aria-label="Partner sections" className="flex flex-wrap gap-1.5 border-b border-brand-ink/10 pb-3">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/hq/partners/${p.id}?tab=${t}`}
            className={`rounded-full px-3.5 py-1.5 text-sm capitalize ${
              t === tab
                ? "bg-brand-ink font-semibold text-white"
                : "text-brand-ink/60 hover:bg-brand-ink/[0.04]"
            }`}
          >
            {t}
          </Link>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "profile" && (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
              <h2 className="font-heading text-lg font-bold">Business</h2>
              <dl className="mt-3">
                <Field label="Legal name" value={p.legalName} />
                <Field label="Business name" value={p.businessName} />
                <Field label="TIN" value={p.tin} />
                <Field label="Address" value={p.address} />
                <Field label="Contact" value={p.email} />
                <Field label="Mobile" value={p.contactMobile} />
              </dl>
            </div>

            <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
              <h2 className="font-heading text-lg font-bold">Licence</h2>
              <dl className="mt-3">
                <Field label="Started" value={date(p.licenseStartedAt)} />
                <Field label="Exclusivity to" value={date(p.exclusivityExpiresAt)} />
                <Field
                  label="Fee paid"
                  value={
                    p.licenseFeePaidCentavos
                      ? `${peso(p.licenseFeePaidCentavos)} on ${date(p.licenseFeePaidAt)}${
                          p.licenseFeeRef ? ` · ${p.licenseFeeRef}` : ""
                        }`
                      : null
                  }
                />
                <Field
                  label="Agreement"
                  value={
                    p.agreementPath
                      ? `On file since ${date(p.agreementUploadedAt)}`
                      : "Not uploaded"
                  }
                />
                <Field label="Split" value={`${p.revenueSharePct}% partner / ${100 - p.revenueSharePct}% CANVEXIA`} />
                <Field
                  label="Collection"
                  value={
                    p.collectionMode === "hq_collects"
                      ? "HQ collects and pays the partner out"
                      : "The partner collects; HQ invoices its share"
                  }
                />
                <Field label="Brand mode" value={p.brandMode} />
                <Field
                  label="Payout details"
                  value={maskedPayout(p.payoutMethod, p.hasPayoutDetails)}
                />
              </dl>
              <p className="mt-3 text-xs text-brand-ink/40">
                Payout account numbers are entered by the partner and are never shown here or
                anywhere else. HQ can see that details exist, not what they are.
              </p>
            </div>

            <div className="rounded-tile border border-brand-ink/10 bg-white p-5 lg:col-span-2">
              <h2 className="font-heading text-lg font-bold">Milestones</h2>
              <ul className="mt-3 space-y-3">
                {p.milestones.steps.map((s) => (
                  <li key={s.month} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {s.target} merchants by month {s.month}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-brand-ink/50">
                        {s.actual} of {s.target}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                          s.status === "missed"
                            ? "bg-guava text-white"
                            : s.status === "at_risk"
                              ? "bg-guava/10 text-guava"
                              : s.status === "met"
                                ? "bg-brand-ink text-white"
                                : "bg-brand-primary/10 text-brand-primary"
                        }`}
                      >
                        {s.status.replace("_", " ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-brand-ink/40">
                Computed by the same function the partner&rsquo;s own portal calls, so what you
                see here is what they see.
              </p>
            </div>
          </div>
        )}

        {tab === "merchants" && (
          <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
            <p className="text-sm">
              <strong className="font-semibold">{p.merchants.total}</strong> merchant
              {p.merchants.total === 1 ? "" : "s"}, {p.merchants.paying} paying,{" "}
              {peso(p.merchants.mrrCentavos)} per month.
            </p>
            <Link
              href={`/hq/merchants?partner=${p.id}`}
              className="mt-3 inline-block rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface"
            >
              Open in the merchant directory
            </Link>
            <p className="mt-3 text-xs text-brand-ink/40">
              The directory is the read-only view of §5, filtered to this partner. It arrives with
              H4; this link will work the day it does.
            </p>
          </div>
        )}

        {tab === "statements" && (
          <div className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
            {p.statements.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
                No frozen statements yet. The monthly run is H6.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Month</th>
                    <th className="px-3 py-3 text-right font-semibold">Gross</th>
                    <th className="px-3 py-3 text-right font-semibold">Partner</th>
                    <th className="px-3 py-3 text-right font-semibold">HQ</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-ink/[0.06]">
                  {p.statements.map((s) => (
                    <tr key={s.id}>
                      <td className="px-5 py-3 font-semibold tabular-nums">{s.month}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{peso(s.grossCentavos)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{peso(s.partnerCentavos)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{peso(s.hqCentavos)}</td>
                      <td className="px-5 py-3">
                        {s.payoutStatus}
                        {s.paidAt && (
                          <span className="text-brand-ink/40"> · {date(s.paidAt)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "staff" && (
          <div className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
            {p.seats.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
                No seats. This partner signs in through the legacy single login.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Person</th>
                    <th className="px-3 py-3 font-semibold">Role</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-ink/[0.06]">
                  {p.seats.map((s) => (
                    <tr key={s.id}>
                      <td className="px-5 py-3">
                        <span className="block font-semibold">{s.name ?? s.email}</span>
                        {s.name && <span className="text-xs text-brand-ink/45">{s.email}</span>}
                      </td>
                      <td className="px-3 py-3">{s.role}</td>
                      <td className="px-5 py-3">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/40">
              Seats are managed by the partner&rsquo;s own admin. Deactivating one from HQ arrives
              with the HQ team screen in H7.
            </p>
          </div>
        )}

        {tab === "activity" && (
          <div className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
            {p.activity.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
                Nothing recorded against this partner yet.
              </p>
            ) : (
              <ul className="divide-y divide-brand-ink/[0.06]">
                {p.activity.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm">
                    <span className="font-mono text-xs text-brand-ink/70">{a.action}</span>
                    <span className="text-xs text-brand-ink/45">
                      {a.actorEmail ?? a.actorType ?? "system"}
                    </span>
                    {a.reason && <span className="text-xs text-brand-ink/55">“{a.reason}”</span>}
                    <span className="ml-auto text-xs tabular-nums text-brand-ink/35">
                      {a.createdAt.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "actions" && (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            {p.status !== "approved" && <ApprovePartner id={p.id} name={p.name} />}

            <ExtendExclusivity
              id={p.id}
              current={p.exclusivityExpiresAt ? date(p.exclusivityExpiresAt) : null}
            />

            {/*
              HIDDEN, not disabled, for an ops admin — the same rule as the
              portal. requireHqAction refuses the POST regardless, which is what
              actually stops it; this just avoids teaching somebody exactly what
              they are missing.
            */}
            {canImpersonate && <ViewAsPartner id={p.id} name={p.name} />}
            {canSuspend && p.status !== "suspended" && (
              <SuspendPartner id={p.id} name={p.name} />
            )}
            {canSuspend && p.exclusivityExpiresAt && (
              <RevokeExclusivity id={p.id} name={p.name} />
            )}

            {!canSuspend && (
              <p className="rounded-xl border border-dashed border-brand-ink/15 p-4 text-xs text-brand-ink/50 lg:col-span-2">
                Suspension, revocation and reassignment are super-admin actions.
              </p>
            )}

            <p className="text-xs text-brand-ink/40 lg:col-span-2">
              Reassigning every merchant to another partner arrives with the merchant directory in
              H4 — it is the same operation as a single reassignment, run over a list, and it
              belongs next to the list.
            </p>
          </div>
        )}
      </div>
    </HqShell>
  );
}
