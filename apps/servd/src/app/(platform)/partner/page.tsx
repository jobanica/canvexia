import { requirePartnerPage } from "@/server/partners/auth";
import { getPartnerDashboard, getPartnerTrainingUrl } from "@/server/partners/portal";
import { listPartnerDemos } from "@/server/partners/demo-queries";
import { signOutPartner } from "@/server/partners/login-action";
import { PartnerDemos } from "@/components/partner/PartnerDemos";
import { TrainingVideo } from "@/components/partner/TrainingVideo";
import { AppIcon, Wordmark } from "@/components/Wordmark";

const DEMO = { label: "Demo", cls: "bg-plum-ink/5 text-plum-ink/60" };
const LIVE = { label: "Live ✓", cls: "bg-mango/15 text-mango" };

export default async function PartnerPortalPage() {
  const partner = await requirePartnerPage();

  if (partner.status !== "approved") {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-3xl">{partner.status === "suspended" ? "⛔" : "⏳"}</p>
        <h1 className="mt-2 font-heading text-2xl font-bold">
          {partner.status === "suspended" ? "Account suspended" : "Application under review"}
        </h1>
        <p className="mt-2 text-plum-ink/60">
          {partner.status === "suspended"
            ? "Your partner account is currently suspended. Contact Servd support."
            : "Thanks for applying! We'll email you once your partner account is approved."}
        </p>
        <form action={signOutPartner} className="mt-6">
          <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold text-plum-ink/70 hover:bg-cream">
            Log out
          </button>
        </form>
      </div>
    );
  }

  const data = await getPartnerDashboard(partner.id);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const demos = await listPartnerDemos(partner.id);
  const trainingUrl = await getPartnerTrainingUrl();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AppIcon size={26} />
          <Wordmark size="1.1rem" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-plum-ink/50">
            {partner.name} · {partner.tier}
          </span>
          <form action={signOutPartner}>
            <button className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold text-plum-ink/70 hover:bg-cream">
              Log out
            </button>
          </form>
        </div>
      </div>

      <h1 className="mt-6 font-heading text-2xl font-bold">Partner dashboard</h1>

      <p className="mt-1 text-sm text-plum-ink/55">
        Set up as many restaurants as you like. What you charge them is yours to decide —
        Servd doesn&apos;t take a cut and never sees the price.
      </p>

      {trainingUrl && (
        <div className="mt-4">
          <TrainingVideo url={trainingUrl} />
        </div>
      )}

      <div className="mt-4">
        <PartnerDemos demos={demos} appUrl={base} />
      </div>

      <div className="mt-4 rounded-tile border border-plum-ink/10 bg-white p-5">
        <p className="mb-3 text-sm font-semibold">
          Your restaurants
          {data.accounts.length > 0 &&
            ` (${data.accounts.filter((a) => a.converted).length} live · ${
              data.accounts.filter((a) => !a.converted).length
            } demo)`}
        </p>
        {data.accounts.length === 0 ? (
          <p className="text-sm text-plum-ink/50">
            None yet. Build a preview above to show a restaurant what theirs would look like.
          </p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {data.accounts.map((r) => {
              const s = r.converted ? LIVE : DEMO;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-plum-ink/45">
                      Set up {new Date(r.createdAt).toLocaleDateString()} · /{r.slug}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-6 text-xs text-plum-ink/40">
        There is no cap on how many restaurants you can set up, and no commission in either
        direction — you bill your clients yourself, at whatever you decide.
      </p>
    </div>
  );
}
