import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getFeedbackList, getFeedbackStats } from "@/server/feedback/queries";
import { manilaDateTime } from "@/lib/time/manila";

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} of 5`}>
      <span className="text-mango">{"★".repeat(rating)}</span>
      <span className="text-plum-ink/20">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default async function FeedbackInboxPage() {
  const { restaurantId } = await requireAdminPage();
  const [items, stats] = await Promise.all([
    getFeedbackList(restaurantId),
    getFeedbackStats(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-plum-ink/50">
            ← Dashboard
          </Link>
          <h1 className="font-heading text-2xl font-bold">Feedback</h1>
          <p className="text-sm text-plum-ink/50">
            {stats.count} response{stats.count === 1 ? "" : "s"}
            {stats.average !== null && ` · avg ${stats.average} ★`}
          </p>
        </div>
        <Link
          href="/admin/reputation"
          className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
        >
          Reputation settings
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-plum-ink/50">No feedback yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f) => (
            <li
              key={f.id}
              className="rounded-tile border border-plum-ink/10 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <Stars rating={f.rating} />
                <span className="text-xs text-plum-ink/40">
                  {manilaDateTime(f.createdAt)}
                </span>
              </div>
              {f.comment && (
                <p className="mt-2 text-sm text-plum-ink/80">{f.comment}</p>
              )}
              <p className="mt-2 text-xs text-plum-ink/40">
                {f.order?.table?.tableNumber
                  ? `Table ${f.order.table.tableNumber}`
                  : "No table context"}
                {f.googleClick && " · tapped Google review"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
