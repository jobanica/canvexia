import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getLoyaltyConfig, getLoyaltyMembers, getLoyaltyActivity } from "@/server/loyalty/loyalty";
import { formatPeso } from "@/lib/money";
import { LoyaltyForm } from "@/components/admin/LoyaltyForm";
import { manilaDate, manilaDateTime } from "@/lib/time/manila";

export default async function LoyaltyPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "loyalty", "Loyalty & rewards");
  if (locked) return locked;
  const [cfg, members, activity] = await Promise.all([
    getLoyaltyConfig(restaurantId),
    getLoyaltyMembers(restaurantId),
    getLoyaltyActivity(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Loyalty &amp; rewards</h1>
        <p className="text-sm text-plum-ink/50">
          Customers earn points on every paid order (by phone number in the app) and redeem them
          as a discount — the cashier confirms redemption at checkout.
        </p>
      </div>

      <LoyaltyForm
        initial={{
          enabled: cfg.enabled,
          pesosPerPoint: cfg.pesosPerPoint,
          pointValuePesos: cfg.pointValue / 100,
        }}
      />

      {/* Members */}
      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">
          Members <span className="text-plum-ink/40">({members.length})</span>
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-plum-ink/50">
            No members yet. Customers join from the app&apos;s Rewards section.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-plum-ink/50">
                <tr className="border-b border-plum-ink/10">
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2 text-right">Points</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-right">Total earned</th>
                  <th className="px-4 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.phone} className="border-t border-plum-ink/5">
                    <td className="px-4 py-2 font-medium">{m.name ?? "—"}</td>
                    <td className="px-4 py-2 text-plum-ink/70">{m.phone}</td>
                    <td className="px-4 py-2 text-right font-semibold">{m.points}</td>
                    <td className="px-4 py-2 text-right text-plum-ink/60">
                      {formatPeso(m.points * cfg.pointValue)}
                    </td>
                    <td className="px-4 py-2 text-right text-plum-ink/60">{m.totalEarned}</td>
                    <td className="px-4 py-2 text-plum-ink/50">
                      {manilaDate(m.joinedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent points activity */}
      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No points earned or redeemed yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-plum-ink/50">
                <tr className="border-b border-plum-ink/10">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-t border-plum-ink/5">
                    <td className="px-4 py-2 text-plum-ink/60">{manilaDateTime(a.createdAt)}</td>
                    <td className="px-4 py-2 text-plum-ink/70">{a.phone}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          a.kind === "earn" ? "bg-mango/15 text-mango" : a.kind === "redeem" ? "bg-brand-primary/10 text-brand-primary" : "bg-plum-ink/5 text-plum-ink/50"
                        }`}
                      >
                        {a.kind}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${a.points < 0 ? "text-guava" : "text-mango"}`}>
                      {a.points > 0 ? `+${a.points}` : a.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
