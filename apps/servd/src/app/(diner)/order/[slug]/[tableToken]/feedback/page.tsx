import { notFound } from "next/navigation";
import {
  getPublicRestaurantBySlug,
  getTableByToken,
} from "@/server/restaurants/get-public";
import { FeedbackForm } from "@/components/diner/FeedbackForm";
import { SmsOptIn } from "@/components/diner/SmsOptIn";

/**
 * Diner feedback screen (white-label). Reached after payment, or via the "Leave
 * feedback" link. Everyone gets the same rating + comment ask and the same
 * Google review invite — no sentiment-based routing.
 */
export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tableToken: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { slug, tableToken } = await params;
  const { paid } = await searchParams;
  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();
  const table = await getTableByToken(restaurant.id, tableToken);
  if (!table) notFound();

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      {paid === "1" && (
        <div className="mb-4 rounded-tile bg-brand-gradient p-6 text-center text-white shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-2xl">
            ✓
          </div>
          <h1 className="mt-3 font-heading text-xl font-extrabold">
            Thank you so much for dining with us!
          </h1>
          <p className="mt-1 text-sm text-white/85">Your payment was received. 💛</p>
        </div>
      )}
      <div className="rounded-tile bg-white p-6 shadow-sm">
        <FeedbackForm
          slug={slug}
          tableToken={tableToken}
          googleReviewUrl={restaurant.googleReviewUrl}
        />
      </div>

      {/* Marketing opt-in — separate from feedback and the review ask. */}
      <div className="mt-4 rounded-tile bg-white p-6 shadow-sm">
        <SmsOptIn
          slug={slug}
          restaurantName={restaurant.displayName || restaurant.name}
          source="feedback_screen"
        />
      </div>
    </div>
  );
}
