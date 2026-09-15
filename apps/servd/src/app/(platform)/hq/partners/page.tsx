import { requireHqPage } from "@/server/hq/auth";
import { getHqOverview } from "@/server/hq/overview";
import { HqShell } from "@/components/hq/HqShell";
import { HealthBoard } from "@/components/hq/HealthBoard";

/**
 * Every partner, with the same columns as the Overview's board.
 *
 * THE SAME COMPONENT, deliberately. The brief asks for "the same columns as the
 * health board plus contacts", and the way to keep two screens agreeing about
 * who is at risk is for there to be one screen's worth of code. Contacts live
 * on the detail page rather than as two more columns here — an email address is
 * not something anyone scans a table for.
 */
export default async function HqPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAsError?: string }>;
}) {
  const user = await requireHqPage("partners.read");
  const [{ board }, sp] = await Promise.all([getHqOverview(), searchParams]);

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
      <HealthBoard rows={board} />
    </HqShell>
  );
}
