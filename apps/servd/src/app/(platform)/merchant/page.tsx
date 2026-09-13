import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { hasFeature } from "@/server/billing/feature-gate";
import { getMerchantOrders } from "@/server/orders/merchant";
import { getPlanBannerData } from "@/server/billing/plan-status";
import { MerchantBoard } from "@/components/merchant/MerchantBoard";

// The realtime alarm screen must never be statically cached.
export const dynamic = "force-dynamic";

export default async function MerchantPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["merchant", "admin", "cashier"].includes(user.role)) {
    redirect("/login");
  }

  // Online ordering is the whole point of this screen — gate on the plan.
  const entitled = await hasFeature(user.restaurantId, "onlineOrdering");
  if (!entitled) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
        <h1 className="font-heading text-2xl font-bold text-plum-ink">Online ordering isn&apos;t on your plan</h1>
        <p className="max-w-sm text-sm text-plum-ink/60">
          The Incoming Orders screen needs the online-ordering feature (Growth plan and up). Ask the
          restaurant owner to upgrade.
        </p>
        <Link href="/admin/billing?upgrade=onlineOrdering" className="rounded-full px-6 py-3 font-semibold btn-brand">
          See plans
        </Link>
      </div>
    );
  }

  // getMerchantOrders resolves the session again for itself, and on a tablet
  // left open all service that second lookup can come back empty — the access
  // token expires and a concurrent refresh loses the race, so the refresh token
  // is already spent by the time this runs. Throwing there turned a lapsed
  // session into a 500 on the screen the shop watches for orders. Send them to
  // sign in instead, which is what an expired session actually means.
  let restaurant, initial, bannerData;
  try {
    [restaurant, initial, bannerData] = await Promise.all([
      tenantDb(user.restaurantId, (tx) => tx.restaurant.findFirst({ select: { name: true } })),
      getMerchantOrders(),
      getPlanBannerData(user.restaurantId).catch(() => null),
    ]);
  } catch (e) {
    if (e instanceof Error && /UNAUTHORIZED|FORBIDDEN/.test(e.message)) redirect("/login");
    throw e;
  }

  return (
    <MerchantBoard
      restaurantId={user.restaurantId}
      restaurantName={restaurant?.name ?? "Your restaurant"}
      initial={initial}
      bannerData={bannerData}
    />
  );
}
