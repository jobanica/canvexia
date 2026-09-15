import { requirePartnerPage } from "@/server/partners/auth";
import { getPartnerDashboard, getPartnerTrainingUrl } from "@/server/partners/portal";
import { listPartnerDemos } from "@/server/partners/demo-queries";
import { listPartnerPharmacies } from "@/server/partners/pharmacies";
import { provisionableProducts } from "@/server/products";
import { PRODUCTS } from "@servd/core";
import { signOutPartner } from "@/server/partners/login-action";
import { PartnerDemos } from "@/components/partner/PartnerDemos";
import { PartnerPharmacies } from "@/components/partner/PartnerPharmacies";
import { NewMerchant } from "@/components/partner/NewMerchant";
import { TrainingVideo } from "@/components/partner/TrainingVideo";
import { CanvexiaLockup } from "@/components/partner/CanvexiaBrand";

const DEMO = { label: "Demo", cls: "bg-brand-ink/5 text-brand-ink/60" };
const LIVE = { label: "Live ✓", cls: "bg-brand-primary/15 text-brand-primary" };

export default async function PartnerPortalPage() {
  const partner = await requirePartnerPage();

  if (partner.status !== "approved") {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-3xl">{partner.status === "suspended" ? "⛔" : "⏳"}</p>
        <h1 className="mt-2 font-heading text-2xl font-bold">
          {partner.status === "suspended" ? "Account suspended" : "Application under review"}
        </h1>
        <p className="mt-2 text-brand-ink/60">
          {partner.status === "suspended"
            ? "Your partner account is currently suspended. Contact Servd support."
            : "Thanks for applying! We'll email you once your partner account is approved."}
        </p>
        <form action={signOutPartner} className="mt-6">
          <button className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold text-brand-ink/70 hover:bg-brand-surface">
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
  // Resceta merchants live on their own axis (D29), so they are a second query.
  const pharmacies = await listPartnerPharmacies(partner.id);
  // From the registry, not a list written here: a vertical appears in the form
  // by registering an adapter (D36).
  const products = provisionableProducts().map((id) => ({
    id,
    name: PRODUCTS[id].name,
    description: PRODUCTS[id].description,
  }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <CanvexiaLockup size={26} />
        <div className="flex items-center gap-3">
          <span className="text-sm text-brand-ink/50">
            {partner.name} · {partner.tier}
          </span>
          <form action={signOutPartner}>
            <button className="rounded-full border border-brand-ink/15 px-3 py-1.5 text-xs font-semibold text-brand-ink/70 hover:bg-brand-surface">
              Log out
            </button>
          </form>
        </div>
      </div>

      <h1 className="mt-6 font-heading text-2xl font-bold">Partner dashboard</h1>

      {/*
        The two tiers are paid differently, so they cannot be told the same
        thing. "Servd doesn't take a cut" is the LEGACY reseller contract — it
        was said in writing and those partners keep it (see Partner.tier in the
        schema). A CANVEXIA operator is on a revenue share, and showing them the
        zero-cut line contradicts canvexia.com, which states the 70/30 split on
        the page that recruited them. A partner reading both would be right to
        wonder which one is true.
      */}
      {partner.tier === "operator" ? (
        <p className="mt-1 text-sm text-brand-ink/55">
          Set up as many merchants as you like. You keep{" "}
          <strong className="font-semibold text-brand-ink/80">{partner.revenueSharePct}%</strong>{" "}
          of what each one pays every month; CANVEXIA keeps {100 - partner.revenueSharePct}%.
        </p>
      ) : (
        <p className="mt-1 text-sm text-brand-ink/55">
          Set up as many restaurants as you like. What you charge them is yours to decide —
          Servd doesn&apos;t take a cut and never sees the price.
        </p>
      )}

      {trainingUrl && (
        <div className="mt-4">
          <TrainingVideo url={trainingUrl} />
        </div>
      )}

      <div className="mt-4">
        <PartnerDemos demos={demos} appUrl={base} />
      </div>

      <div className="mt-4 rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="mb-3 text-sm font-semibold">
          Your restaurants
          {data.accounts.length > 0 &&
            ` (${data.accounts.filter((a) => a.converted).length} live · ${
              data.accounts.filter((a) => !a.converted).length
            } demo)`}
        </p>
        {data.accounts.length === 0 ? (
          <p className="text-sm text-brand-ink/50">
            None yet. Build a preview above to show a restaurant what theirs would look like.
          </p>
        ) : (
          <ul className="divide-y divide-brand-ink/5">
            {data.accounts.map((r) => {
              const s = r.converted ? LIVE : DEMO;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-brand-ink/45">
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

      <NewMerchant products={products} />

      <PartnerPharmacies pharmacies={pharmacies} />

      <p className="mt-6 text-xs text-brand-ink/40">
        There is no cap on how many restaurants you can set up, and no commission in either
        direction — you bill your clients yourself, at whatever you decide.
      </p>
    </div>
  );
}
