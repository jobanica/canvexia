import Link from "next/link";
import { NOTIFICATION_EVENTS, NOTIFICATION_LABELS, parseMilestones } from "@servd/core";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { PortalShell } from "@/components/partner/PortalShell";
import { peso } from "@/components/partner/Overview";
import {
  getNotificationPrefs,
  setNotificationPrefAction,
} from "@/server/partners/notifications-actions";

/**
 * Settings: notifications, payout details, and the agreement.
 *
 * The agreement card is READ-ONLY and deliberately plain. It is the answer to
 * "what did I actually sign up for", and a partner should not have to ask HQ to
 * find out their own milestone targets.
 *
 * PAYOUT DETAILS ARE NOT COLLECTED HERE YET. `payoutDetailsEnc` is encrypted
 * with `CREDENTIALS_ENCRYPTION_KEY`, which is unset on every deployment — so a
 * form here would either store a bank number in plaintext or fail on submit.
 * Neither is acceptable for that field, so the card says what is needed instead
 * of pretending to take it.
 */
export default async function PartnerSettingsPage() {
  const partner = await requirePartnerPageWith("settings.write");

  const row = await systemDb((tx) =>
    tx.partner.findUnique({
      where: { id: partner.id },
      select: {
        territory: true,
        tier: true,
        revenueSharePct: true,
        collectionMode: true,
        licenseStartedAt: true,
        exclusivityExpiresAt: true,
        milestones: true,
        payoutMethod: true,
      },
    }),
  );

  const ladder = parseMilestones(row?.milestones);
  const canEncrypt = !!process.env.CREDENTIALS_ENCRYPTION_KEY;
  const prefs = await getNotificationPrefs(partner.id, partner.user.id);
  // A legacy login has no `partner_users` row, so there is no seat to store a
  // preference against. It sees the list and no switches, which is the truth.
  const canChoose = !!partner.user.id && !partner.impersonatedBy;

  return (
    <PortalShell
      partner={partner}
      title="Settings"
    >
        <section className="mt-6 rounded-tile border border-brand-ink/10 bg-white p-5">
          <h2 className="font-heading text-lg font-bold">Your agreement</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ["Territory", row?.territory ?? "Not set"],
              ["Tier", row?.tier ?? "—"],
              ["Your share", `${row?.revenueSharePct ?? 0}%`],
              [
                "Who collects",
                row?.collectionMode === "hq_collects" ? "CANVEXIA collects" : "You collect",
              ],
              [
                "Licence started",
                row?.licenseStartedAt ? row.licenseStartedAt.toLocaleDateString() : "Not set",
              ],
              [
                "Exclusivity until",
                row?.exclusivityExpiresAt
                  ? row.exclusivityExpiresAt.toLocaleDateString()
                  : "Not set",
              ],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
                  {k}
                </dt>
                <dd className="mt-1 text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
            Milestones
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {ladder.map((m) => (
              <li key={m.month}>
                {m.target} merchants by month {m.month}
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-brand-ink/45">
            {/* No link to a signed PDF: nothing has been uploaded to Storage,
                and a dead link to a contract is worse than none. */}
            A copy of your signed agreement is not in the portal yet. Ask HQ and we will
            send it.
          </p>
        </section>

        <section className="mt-6 rounded-tile border border-brand-ink/10 bg-white p-5">
          <h2 className="font-heading text-lg font-bold">Payout details</h2>
          {row?.payoutMethod ? (
            <p className="mt-2 text-sm text-brand-ink/60">
              On file: {row.payoutMethod} · •••• (stored encrypted, shown masked)
            </p>
          ) : (
            <p className="mt-2 text-sm text-brand-ink/60">Nothing on file yet.</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-brand-ink/45">
            {canEncrypt
              ? "Send your bank or GCash details to HQ and we will store them encrypted."
              : "Encryption is not configured on this deployment yet, so the portal will not take a bank or GCash number — it would have to store it in the clear. Send it to HQ directly for now."}
          </p>
        </section>

        <section className="mt-6 rounded-tile border border-brand-ink/10 bg-white p-5">
          <h2 className="font-heading text-lg font-bold">Notifications</h2>
          <p className="mt-1 text-sm text-brand-ink/55">
            What we email you about. These are yours, not your team&rsquo;s — each seat
            chooses for itself.
          </p>
          <ul className="mt-4 space-y-2">
            {NOTIFICATION_EVENTS.map((e) => {
              const on = prefs[e] !== false;
              return (
                <li key={e} className="flex items-center justify-between gap-3 text-sm">
                  <span className={on ? "" : "text-brand-ink/40"}>{NOTIFICATION_LABELS[e]}</span>
                  {canChoose ? (
                    <form action={setNotificationPrefAction}>
                      <input type="hidden" name="event" value={e} />
                      <input type="hidden" name="on" value={on ? "false" : "true"} />
                      <button
                        aria-pressed={on}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          on
                            ? "border-brand-primary/40 bg-brand-primary/10 text-brand-primary"
                            : "border-brand-ink/15 text-brand-ink/45 hover:bg-brand-surface"
                        }`}
                      >
                        {on ? "Email on" : "Email off"}
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-brand-ink/40">{on ? "email" : "off"}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-brand-ink/45">
            {/*
              These switches were inert until the digest had something to control.
              They now decide who the daily digest is QUEUED for — and queued is
              still the honest word: CREDENTIALS_ENCRYPTION_KEY is unset on this
              deployment, so no Resend key can even be stored and nothing leaves
              the queue yet. Turning one off means you will not be in the queue
              when it drains.
            */}
            The daily digest is composed every morning and queued for whoever has email
            on here. Nothing leaves the queue yet — email sending is not configured on
            this deployment — so turning one off decides what you get the day it is.
            Messenger is on the list for later.
          </p>
        </section>

        <p className="mt-8 text-xs text-brand-ink/35">
          Signed in as {partner.user.email} ({partner.user.role}) ·{" "}
          <Link href="/partner/team" className="underline">
            Team
          </Link>
        </p>
    </PortalShell>
  );
}
