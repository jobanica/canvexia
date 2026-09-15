import Link from "next/link";
import { partnerAllows, partnerCan, requirePartnerPage } from "@/server/partners/auth";
import { getMyDay } from "@/server/partners/my-day";
import { MyDay } from "@/components/partner/MyDay";
import {
  getPartnerOverview,
  getPartnerProfile,
  maskAmounts,
  onboardingChecklist,
} from "@/server/partners/overview";
import { getPartnerTrainingUrl } from "@/server/partners/portal";
import { getHqBookingUrl } from "@/server/hq/applications";
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
import { FilterChip, PortalShell } from "@/components/partner/PortalShell";
import { AnnouncementBanner } from "@/components/partner/AnnouncementBanner";
import { announcementsForPartner } from "@/server/hq/announcements";

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

  /**
   * THE FORK (A7). Four roles, two overviews.
   *
   * A seat without `merchants.view_all` is a salesperson or a support person:
   * they get "My day" — their own follow-ups, their own merchants, their own
   * target — rather than a cut-down version of the operator's. The two answer
   * different questions, and only the second one is actionable by the person
   * reading it.
   *
   * Keyed on the PERMISSION, not the role name, so an operator who grants their
   * salespeople `merchants.view_all` gets the partner-wide overview for them
   * without a code change. A legacy login has no seat id and therefore cannot
   * have a personal overview; it takes the partner-wide one, which is what it
   * has always had.
   */
  if (partner.user.id && !partnerAllows(partner, "merchants.view_all")) {
    const day = await getMyDay(partner.id, partner.user.id);
    return (
      <PortalShell
        partner={partner}
        title={`Hi, ${(partner.user.name ?? partner.user.email).split(/[\s@]/)[0]}`}
        subtitle="Your day at a glance."
      >
        <AnnouncementBanner items={await announcementsForPartner(partner.id).catch(() => [])} />
        <div className="mt-4">
          <MyDay
            day={day}
            canSeeCommission={partnerAllows(partner, "commissions.view_own")}
            canCheckIn={partnerAllows(partner, "attendance.checkin")}
            canSeePipeline={partnerAllows(partner, "pipeline.view_own")}
          />
        </div>
      </PortalShell>
    );
  }

  // Every one of these opens its own scoped transaction, so awaiting them in
  // sequence paid for each round trip end to end. Nothing here depends on
  // anything else here, so they go out together.
  const [rawOverview, profile, demos, trainingUrl, pharmacies, bookingUrl] = await Promise.all([
    getPartnerOverview(partner.id),
    getPartnerProfile(partner.id),
    listPartnerDemos(partner.id),
    getPartnerTrainingUrl(),
    // Resceta merchants live on their own axis (D29), so they are a second query.
    listPartnerPharmacies(partner.id),
    // HQ's kickoff calendar, for the checklist's last step. It already swallows
    // its own failure and returns null, so it joins the parallel batch.
    getHqBookingUrl(),
  ]);
  // Separate from the Promise.all above because it is best-effort: an
  // announcement table that is not migrated must not take the dashboard down.
  const announcements = await announcementsForPartner(partner.id).catch(() => []);
  // Masked HERE, not in the component. Hiding a number the server already put
  // in the props leaves it in the page source, readable by exactly the person
  // the rule is about.
  const showAmounts = partnerAllows(partner, "overview.revenue_amounts");
  const overview = showAmounts ? rawOverview : maskAmounts(rawOverview);
  const territory = profile?.territory ?? null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // From the registry, not a list written here: a vertical appears in the form
  // by registering an adapter (D36).
  const products = provisionableProducts().map((id) => ({
    id,
    name: PRODUCTS[id].name,
    description: PRODUCTS[id].description,
  }));

  return (
    <PortalShell
      partner={partner}
      title="Overview"
      counts={{ merchants: overview.merchants.length }}
      actions={
        <>
          {/*
            The reference puts three filter dropdowns here. These are CHIPS, not
            selects: there is exactly one partner, one territory and one "today"
            to choose from, and a dropdown with a single option is a control that
            teaches people it does nothing. They become selects when a partner
            has more than one of anything.
          */}
          <FilterChip>{partner.user.name ?? partner.user.email}</FilterChip>
          {territory && <FilterChip>{territory}</FilterChip>}
          <FilterChip>Today</FilterChip>
        </>
      }
    >
      <AnnouncementBanner items={announcements} />

      {/*
        The two tiers are paid differently, so they cannot be told the same
        thing. "Servd doesn't take a cut" is the LEGACY reseller contract — it
        was said in writing and those partners keep it (see Partner.tier in the
        schema). A CANVEXIA operator is on a revenue share, and showing them the
        zero-cut line contradicts canvexia.com, which states the 70/30 split on
        the page that recruited them. A partner reading both would be right to
        wonder which one is true.
      */}
      {!showAmounts ? (
        // An ops manager is told the shape of the arrangement without the
        // number. "You keep 70%" is the operator's commercial term with HQ and
        // is not a manager's to know — it is the same fact as the payout,
        // expressed as a ratio.
        <p className="text-sm text-brand-ink/55">
          Set up as many merchants as you like. Revenue figures are hidden for your role.
        </p>
      ) : partner.tier === "operator" ? (
        <p className="text-sm text-brand-ink/55">
          Set up as many merchants as you like. You keep{" "}
          <strong className="font-semibold text-brand-ink/80">{partner.revenueSharePct}%</strong>{" "}
          of what each one pays every month; CANVEXIA keeps {100 - partner.revenueSharePct}%.
        </p>
      ) : (
        <p className="text-sm text-brand-ink/55">
          Set up as many restaurants as you like. What you charge them is yours to decide —
          Servd doesn&apos;t take a cut and never sees the price.
        </p>
      )}

      <div className="mt-5">
        <StatCards o={overview} showAmounts={showAmounts} />
      </div>

      {profile && (
        <div className="mt-4">
          <OnboardingChecklist
            steps={onboardingChecklist(overview, profile, bookingUrl)}
            canEdit={partnerCan(partner, "settings.write")}
            dismissed={!!overview.onboarding.dismissedAt}
          />
        </div>
      )}

      {/* items-start, or the attention card stretches to match the milestone
          card beside it and an empty state becomes a tall empty box. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
        <AttentionList items={overview.attention} />
        <MilestoneTracker o={overview} />
      </div>

      <div className="mt-4">
        <GrowthChart series={overview.series} />
      </div>

      {trainingUrl && (
        // The checklist's "Finish the training" step links to this anchor.
        <div id="training" className="mt-4 scroll-mt-20">
          <TrainingVideo url={trainingUrl} />
        </div>
      )}

      <div className="mt-4">
        <PartnerDemos
          demos={demos}
          appUrl={base}
          canBuild={partnerCan(partner, "merchants.create")}
        />
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
    </PortalShell>
  );
}
