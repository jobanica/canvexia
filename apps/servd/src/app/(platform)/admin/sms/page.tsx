import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCampaigns, getConfirmedCount, setDoubleOptIn } from "@/server/sms/campaigns";
import { SmsComposeForm } from "@/components/admin/SmsComposeForm";
import { manilaDateTime } from "@/lib/time/manila";

export default async function SmsPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "sms", "SMS marketing");
  if (locked) return locked;

  const restaurant = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: { smsSenderName: true, smsCreditBalance: true, smsDoubleOptIn: true },
    }),
  );
  const [confirmedCount, campaigns] = await Promise.all([
    getConfirmedCount(restaurantId),
    getCampaigns(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">SMS marketing</h1>
      </div>

      {/* Settings */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Credit balance</p>
          <p className="font-heading text-2xl font-extrabold">
            {restaurant.smsCreditBalance}
          </p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Sender name</p>
          <p className="font-heading text-lg font-bold">
            {restaurant.smsSenderName ?? "— not registered —"}
          </p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Confirmed subscribers</p>
          <p className="font-heading text-2xl font-extrabold">{confirmedCount}</p>
        </div>
      </div>

      <form action={setDoubleOptIn} className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="doubleOptIn"
            defaultChecked={restaurant.smsDoubleOptIn}
          />
          Require double opt-in (diner must reply YES) — recommended
        </label>
        <button className="mt-3 rounded-lg border border-plum-ink/15 px-4 py-2 text-xs font-semibold">
          Save consent setting
        </button>
      </form>

      <SmsComposeForm
        confirmedCount={confirmedCount}
        credits={restaurant.smsCreditBalance}
        canSend={!!restaurant.smsSenderName}
      />

      {/* History */}
      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Past campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No campaigns sent yet.</p>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="rounded-tile border border-plum-ink/10 bg-white p-4"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="text-plum-ink/40">
                    {manilaDateTime(c.sentAt ?? c.createdAt)}
                  </span>
                  <span className="text-plum-ink/50">
                    {c.recipientCount} recipient{c.recipientCount === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1 text-sm">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
