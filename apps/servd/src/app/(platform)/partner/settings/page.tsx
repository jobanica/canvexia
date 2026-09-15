import Link from "next/link";
import { NOTIFICATION_EVENTS, NOTIFICATION_LABELS, parseMilestones } from "@servd/core";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { PortalNav } from "@/components/partner/PortalNav";
import { peso } from "@/components/partner/Overview";

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

  return (
    <>
      <PortalNav partner={partner} />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-heading text-2xl font-bold">Settings</h1>

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
            What we would email you about, once email is switched on.
          </p>
          <ul className="mt-4 space-y-2">
            {NOTIFICATION_EVENTS.map((e) => (
              <li key={e} className="flex items-center justify-between gap-3 text-sm">
                <span>{NOTIFICATION_LABELS[e]}</span>
                <span className="text-xs text-brand-ink/40">email</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-brand-ink/45">
            {/*
              The toggles are not interactive yet, and saying so is the point.
              CREDENTIALS_ENCRYPTION_KEY is unset and no Resend key has ever been
              entered, so nothing can send — and a switch that silently controls
              nothing is worse than a list that admits it.
            */}
            These are not switchable yet, because nothing can send. When email is
            configured you will be able to turn each one off, and the daily digest with
            them. Messenger is on the list for later.
          </p>
        </section>

        <p className="mt-8 text-xs text-brand-ink/35">
          Signed in as {partner.user.email} ({partner.user.role}) ·{" "}
          <Link href="/partner/team" className="underline">
            Team
          </Link>
        </p>
      </div>
    </>
  );
}
