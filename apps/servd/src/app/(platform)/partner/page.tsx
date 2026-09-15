import Link from "next/link";
import { requirePartnerPage } from "@/server/partners/auth";
import { getPartnerOverview, getPartnerProfile, onboardingChecklist } from "@/server/partners/overview";
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
import {
  AttentionList,
  MilestoneTracker,
  OnboardingChecklist,
  StatCards,
} from "@/components/partner/Overview";
import { GrowthChart } from "@/components/partner/GrowthChart";
import { PortalNav } from "@/components/partner/PortalNav";

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

  const overview = await getPartnerOverview(partner.id);
  const profile = await getPartnerProfile(partner.id);
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
    <>
    <PortalNav partner={partner} />
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="font-heading text-2xl font-bold">Partner dashboard</h1>

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

      <div className="mt-6">
        <StatCards o={overview} />
      </div>

      {profile && (
        <div className="mt-4">
          <OnboardingChecklist steps={onboardingChecklist(overview, profile)} />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AttentionList items={overview.attention} />
        <MilestoneTracker o={overview} />
      </div>

      <div className="mt-4">
        <GrowthChart series={overview.series} />
      </div>

      {trainingUrl && (
        <div className="mt-4">
          <TrainingVideo url={trainingUrl} />
        </div>
      )}

      <div className="mt-4">
        <PartnerDemos demos={demos} appUrl={base} />
      </div>

      {/*
        The flat list of restaurants that used to live here moved to
        /partner/merchants, which shows every product on one axis rather than
        restaurants here and pharmacies below. What stays is the way in.
      */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-tile border border-brand-ink/10 bg-white p-5">
        <div>
          <p className="text-sm font-semibold">
            {overview.merchants.length === 0
              ? "No merchants yet"
              : `${overview.merchants.length} merchant${overview.merchants.length === 1 ? "" : "s"}`}
          </p>
          <p className="mt-0.5 text-xs text-brand-ink/50">
            {overview.merchants.length === 0
              ? "Open your first account below, or build a preview to pitch with."
              : `${overview.payingCount} paying, across every product.`}
          </p>
        </div>
        {overview.merchants.length > 0 && (
          <Link
            href="/partner/merchants"
            className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface"
          >
            See all merchants
          </Link>
        )}
      </div>

      <NewMerchant products={products} />

      <PartnerPharmacies pharmacies={pharmacies} />

      {/*
        The same tier split as the line at the top, and for the same reason: "no
        commission in either direction" is the LEGACY reseller contract, and
        telling an operator that contradicts both canvexia.com and the numbers
        in the cards directly above it.
      */}
      <p className="mt-6 text-xs text-brand-ink/40">
        {partner.tier === "operator"
          ? `There is no cap on how many merchants you can open. You keep ${partner.revenueSharePct}% of what each one pays, every month they stay.`
          : "There is no cap on how many restaurants you can set up, and no commission in either direction — you bill your clients yourself, at whatever you decide."}
      </p>
      <p className="mt-2 text-xs text-brand-ink/35">Partner portal by CANVEXIA.</p>
    </div>
    </>
  );
}
