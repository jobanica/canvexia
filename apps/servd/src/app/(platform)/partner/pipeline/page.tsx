import { PRODUCTS } from "@servd/core";
import { requirePartnerPageWith, partnerCan } from "@/server/partners/auth";
import { listAssignableSeats, listProspects } from "@/server/partners/prospects";
import { provisionableProducts } from "@/server/products";
import { getPartnerProfile } from "@/server/partners/overview";
import { PortalShell } from "@/components/partner/PortalShell";
import { PipelineBoard } from "@/components/partner/PipelineBoard";
import { ProspectForm } from "@/components/partner/ProspectForm";

/**
 * The pipeline.
 *
 * Read needs `pipeline.read`, which support holds and admin holds; the add form
 * is rendered only for a seat with `pipeline.write`. Hidden, not disabled — a
 * greyed-out form tells a support user exactly what they cannot do and invites
 * a POST; the server action re-checks the capability, which is what makes that
 * fail.
 */
export default async function PartnerPipelinePage() {
  const partner = await requirePartnerPageWith("pipeline.read");
  const [prospects, seats] = await Promise.all([
    listProspects(partner.id),
    listAssignableSeats(partner.id),
  ]);

  const products = provisionableProducts().map((id) => ({ id, name: PRODUCTS[id].name }));
  const profile = await getPartnerProfile(partner.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <PortalShell
      partner={partner}
      title="Pipeline"
      subtitle="Businesses you are working, and the ones who came to you."
      counts={{ pipeline: prospects.length }}
    >
        {prospects.length === 0 ? (
          <div className="mt-6 rounded-tile border border-dashed border-brand-ink/15 bg-white p-10 text-center">
            <p className="font-heading text-lg font-bold">No prospects yet</p>
            <p className="mt-1 text-sm text-brand-ink/55">
              Add one below, or share your lead form and let them come to you.
            </p>
          </div>
        ) : (
          <PipelineBoard prospects={prospects} />
        )}

        {/*
          The lead form's address, which is the only thing that makes it useful.
          A partner with no slug has no public URL yet — say so rather than
          printing /l/null, which looks like a link and is not one.
        */}
        <div className="mt-6 rounded-tile border border-brand-ink/10 bg-white p-5">
          <p className="text-sm font-semibold">Your lead form</p>
          {profile?.slug ? (
            <>
              <p className="mt-1 text-xs text-brand-ink/50">
                Share this. Anything submitted lands in this pipeline as a lead.
              </p>
              <code className="mt-2 block break-all rounded-lg bg-brand-ink/[0.04] px-3 py-2 text-xs">
                {appUrl}/l/{profile.slug}
              </code>
            </>
          ) : (
            <p className="mt-1 text-xs text-brand-ink/50">
              You need a subdomain before you have a public lead form. Set one in Brand.
            </p>
          )}
        </div>

        {partnerCan(partner, "pipeline.write") && (
          <div className="mt-6">
            <ProspectForm products={products} seats={seats} />
          </div>
        )}
    </PortalShell>
  );
}
