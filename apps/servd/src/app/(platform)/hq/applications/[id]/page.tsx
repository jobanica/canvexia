import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHqPage } from "@/server/hq/auth";
import { getApplication, getHqBookingUrl } from "@/server/hq/applications";
import { listTerritories } from "@/server/hq/territories";
import { HqShell } from "@/components/hq/HqShell";
import { ApplicationStatus, ConvertApplication } from "@/components/hq/ApplicationForms";

const HOURS_LABEL: Record<string, string> = {
  under5: "Under 5 hours a week",
  h5to10: "5–10 hours a week",
  h10to20: "10–20 hours a week",
  h20plus: "20+ hours a week",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-brand-ink/[0.06] py-2.5 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-brand-ink/45">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || <span className="text-brand-ink/30">—</span>}</dd>
    </div>
  );
}

export default async function HqApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireHqPage("applications.write");
  const { id } = await params;
  const [app, territories, bookingUrl] = await Promise.all([
    getApplication(id),
    listTerritories(),
    getHqBookingUrl(),
  ]);
  if (!app) notFound();

  const suggested =
    territories.find((t) => t.name.trim().toLowerCase() === app.city.trim().toLowerCase()) ?? null;

  return (
    <HqShell
      user={user}
      title={app.fullName}
      subtitle={`Applied for ${app.city} · ${app.ageDays} days ago · via ${app.source}`}
      actions={
        <Link
          href="/hq/applications"
          className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface"
        >
          All applications
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
          <h2 className="font-heading text-lg font-bold">What they told us</h2>
          <dl className="mt-3">
            <Field label="Email" value={app.email} />
            <Field label="Mobile" value={app.mobile} />
            <Field
              label="City"
              value={
                <>
                  {app.city}
                  {app.province && `, ${app.province}`}
                  {app.territoryName && app.territoryTaken && (
                    <span className="mt-0.5 block text-xs text-guava">
                      {app.territoryName} is already licensed to somebody.
                    </span>
                  )}
                  {!suggested && (
                    <span className="mt-0.5 block text-xs text-brand-accent">
                      Not one of the seeded cities — that is a signal about where demand is, not a
                      mistake. Add it from Territories if it is worth licensing.
                    </span>
                  )}
                </>
              }
            />
            <Field label="Current work" value={app.currentWork} />
            <Field label="Time available" value={HOURS_LABEL[app.hoursPerWeek] ?? app.hoursPerWeek} />
            <Field
              label="Sold before"
              value={app.soldBefore ? (app.soldWhat ? `Yes — ${app.soldWhat}` : "Yes") : "No"}
            />
            <Field label="How they heard" value={app.howHeard} />
          </dl>

          {bookingUrl && (
            <div className="mt-4 rounded-xl border border-brand-ink/12 p-4">
              <p className="text-sm font-semibold">Book a call</p>
              {/*
                Google's booking pages do NOT accept a prefilled email through a
                query string. The brief asks for one "if the provider supports
                it" — it does not, so the address is offered for copying rather
                than appended as a parameter that silently does nothing.
              */}
              <p className="mt-1 text-xs text-brand-ink/55">
                Google Calendar booking pages cannot be prefilled, so paste{" "}
                <code className="text-xs">{app.email}</code> into the form yourself.
              </p>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
              >
                Open the calendar
              </a>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {app.convertedPartnerId ? (
            <div className="rounded-tile border border-brand-primary/30 bg-brand-primary/[0.04] p-5">
              <h2 className="font-heading text-lg font-bold">Already a partner</h2>
              <p className="mt-1 text-sm text-brand-ink/60">
                This application was converted. It is kept rather than deleted — it is the only
                record of where that partner came from.
              </p>
              <Link
                href={`/hq/partners/${app.convertedPartnerId}`}
                className="mt-3 inline-block rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
              >
                Open the partner
              </Link>
            </div>
          ) : (
            <>
              <ApplicationStatus id={app.id} current={app.status} notes={app.notes} />
              <ConvertApplication
                id={app.id}
                applicantName={app.fullName}
                city={app.city}
                suggestedTerritoryId={suggested?.id ?? null}
                territories={territories.map((t) => ({
                  id: t.id,
                  name: t.name,
                  taken: !!t.partnerId,
                  assignable: t.assignable,
                }))}
              />
            </>
          )}
        </div>
      </div>
    </HqShell>
  );
}
