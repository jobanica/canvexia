import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listOrders } from "@/server/pharmacy/storefront";
import { pharmacySettings } from "@/server/pharmacy/settings";
import { can } from "@/lib/pharmacy/roles";
import { OrderCard } from "./OrderCard";

export const dynamic = "force-dynamic";

/**
 * Orders that came in from the shop page.
 *
 * WAITING FIRST. An order nobody has confirmed is a customer waiting by their
 * phone; a completed one is a record. Sorting them together by date puts the
 * urgent ones wherever the calendar happens to leave them.
 */
export default async function OrdersPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const [orders, settings] = await Promise.all([
    listOrders(staff.pharmacyId),
    pharmacySettings(staff.pharmacyId),
  ]);

  const open = orders.filter(
    (o) => o.status === "placed" || o.status === "confirmed" || o.status === "ready",
  );
  const closed = orders.filter((o) => o.status === "completed" || o.status === "cancelled");
  const canHandle = can(staff.role, "sell");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Online orders</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Requests from your shop page. Nothing here has taken money or moved
          stock — confirm what you have, then ring it up at the counter as
          normal.
        </p>

        {!settings?.storefrontOn && (
          <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            Your shop page is switched off, so no new orders can arrive. Turn it
            on under{" "}
            <Link href="/settings" className="font-medium underline">
              Settings
            </Link>
            .
          </p>
        )}

        {open.length === 0 && closed.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            No orders yet.
          </p>
        ) : (
          <>
            {open.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Waiting on you
                </h2>
                <div className="space-y-4">
                  {open.map((o) => (
                    <OrderCard key={o.id} order={o} canHandle={canHandle} />
                  ))}
                </div>
              </section>
            )}

            {closed.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Done
                </h2>
                <div className="space-y-4">
                  {closed.map((o) => (
                    <OrderCard key={o.id} order={o} canHandle={false} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
