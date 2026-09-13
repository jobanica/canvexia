import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { ReputationSettingsForm } from "@/components/admin/ReputationSettingsForm";

export default async function ReputationSettingsPage() {
  const { restaurantId } = await requireAdminPage();
  const restaurant = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: { googleReviewUrl: true, feedbackMode: true },
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/feedback" className="text-sm text-plum-ink/50">
          ← Feedback
        </Link>
        <h1 className="font-heading text-2xl font-bold">Reputation settings</h1>
      </div>
      <ReputationSettingsForm
        initial={{
          googleReviewUrl: restaurant.googleReviewUrl ?? "",
          feedbackMode: restaurant.feedbackMode,
        }}
      />
    </div>
  );
}
