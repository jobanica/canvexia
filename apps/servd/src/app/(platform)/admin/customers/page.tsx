import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getCustomers } from "@/server/customers/customers";
import { formatPeso } from "@/lib/money";
import { AddCustomerForm } from "@/components/customers/AddCustomerForm";
import { manilaDate } from "@/lib/time/manila";

export default async function CustomersPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "customers", "Customers");
  if (locked) return locked;
  const customers = await getCustomers(restaurantId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold">Customers</h1>
            <p className="text-sm text-plum-ink/50">
              Everyone who has ordered or joined rewards — with points, spend and contact details.
            </p>
          </div>
          <a
            href="/api/customers/export"
            className="rounded-full border border-plum-ink/15 bg-white px-4 py-2 text-sm font-semibold text-plum-ink hover:bg-cream"
          >
            ⬇ Download CSV
          </a>
        </div>
      </div>

      <AddCustomerForm />

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">
          All customers <span className="text-plum-ink/40">({customers.length})</span>
        </h2>
        {customers.length === 0 ? (
          <p className="text-sm text-plum-ink/50">
            No customers yet. Pickup &amp; delivery orders are saved here automatically, and you can
            add walk-ins above.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-plum-ink/50">
                <tr className="border-b border-plum-ink/10">
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2 text-right">Points</th>
                  <th className="px-4 py-2 text-right">Orders</th>
                  <th className="px-4 py-2 text-right">Total spent</th>
                  <th className="px-4 py-2">Last order</th>
                  <th className="px-4 py-2">Address</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.phone} className="border-t border-plum-ink/5">
                    <td className="px-4 py-2 font-medium">{c.name ?? "—"}</td>
                    <td className="px-4 py-2 text-plum-ink/70">{c.phone}</td>
                    <td className="px-4 py-2 text-right font-semibold">{c.points}</td>
                    <td className="px-4 py-2 text-right text-plum-ink/60">{c.orders}</td>
                    <td className="px-4 py-2 text-right text-plum-ink/60">{formatPeso(c.totalSpent)}</td>
                    <td className="px-4 py-2 text-plum-ink/50">
                      {c.lastOrderAt ? manilaDate(c.lastOrderAt) : "—"}
                    </td>
                    <td className="px-4 py-2 text-plum-ink/50">{c.address ?? "—"}</td>
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
