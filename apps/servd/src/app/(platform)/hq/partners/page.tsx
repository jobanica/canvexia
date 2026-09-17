import { requireHqPage } from "@/server/hq/auth";
import { getHqOverview } from "@/server/hq/overview";
import { HqShell } from "@/components/hq/HqShell";
import { HealthBoard } from "@/components/hq/HealthBoard";
import { NewPartner } from "@/components/hq/NewPartner";
import { listTerritories } from "@/server/hq/territories";
import { hqCan } from "@servd/core";

/**
 * Every partner, with the same columns as the Overview's board.
 *
 * THE SAME COMPONENT, deliberately. The brief asks for "the same columns as the
 * health board plus contacts", and the way to keep two screens agreeing about
 * who is at risk is for there to be one screen's worth of code. Contacts live
 * on the detail page rather than as two more columns here — an email address is
 * not something anyone scans a table for.
 *
 * AND THE ONLY PLACE A PARTNER CAN BE MADE FROM SCRATCH.
 *
 * REPORTED — "in the partners section in HQ, i dont have an option to create a
 * partner." There was none anywhere. Every partner had to arrive as an
 * application from canvexia.com's form and then be converted, so a partner HQ
 * signed in person could not be entered. This page listed them and offered no
 * way to add one, which is the same shape as a permission with no control
 * behind it: `partners.write` said yes and the screen offered nothing.
 *
 * It goes HERE rather than on Applications because this is the list somebody
 * opens looking for a partner, and a partner who never applied has no business
 * being added from a screen about applicants.
 */
export default async function HqPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAsError?: string }>;
}) {
  const user = await requireHqPage("partners.read");
  const [{ board }, sp, territories] = await Promise.all([
    getHqOverview(),
    searchParams,
    // For the territory picker on the add form. Read unconditionally rather
    // than behind the capability check: it is a list of city names, and
    // branching a Promise.all on a role is how the two get out of step.
    listTerritories().catch(() => []),
  ]);

  // Hidden, not disabled — the same rule as the nav. `createPartnerAction`
  // checks this again; this only decides whether the form is offered.
  const canCreate = hqCan(user.role, "partners.write");

  return (
    <HqShell
      user={user}
      title="Partners"
      subtitle={`${board.length} partner${board.length === 1 ? "" : "s"}, problems first.`}
    >
      {/* Set by the view-as redeem route when a grant could not be used. */}
      {sp.viewAsError && (
        <p
          role="status"
          className="mb-4 rounded-tile border border-guava/25 bg-guava/[0.04] px-4 py-3 text-sm text-guava"
        >
          {sp.viewAsError}
        </p>
      )}
      {canCreate && (
        <NewPartner
          territories={territories.map((t) => ({
            id: t.id,
            name: t.name,
            taken: !!t.partnerId,
            assignable: t.assignable,
          }))}
        />
      )}

      <HealthBoard rows={board} />
    </HqShell>
  );
}
