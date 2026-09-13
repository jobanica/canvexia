import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";

const DATASETS: { type: string; label: string; desc: string }[] = [
  { type: "orders", label: "Orders", desc: "Every order with totals, discounts, gift card, tip and net." },
  { type: "menu", label: "Menu", desc: "Categories, items, prices, availability and dietary tags." },
  { type: "customers", label: "Customers", desc: "Customer contacts with marketing-consent status." },
];

export default async function ExportPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "dataExport", "Data export");
  if (locked) return locked;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Data export</h1>
        <p className="text-sm text-plum-ink/50">
          Download your own data as CSV (for spreadsheets) or JSON. It&apos;s your data — take it
          anytime.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DATASETS.map((d) => (
          <div key={d.type} className="rounded-tile border border-plum-ink/10 bg-white p-5">
            <h2 className="font-heading font-bold">{d.label}</h2>
            <p className="mt-1 text-sm text-plum-ink/55">{d.desc}</p>
            <div className="mt-4 flex gap-2">
              <a
                href={`/api/admin/export?type=${d.type}&format=csv`}
                className="rounded-full px-4 py-2 text-sm font-semibold btn-brand"
              >
                CSV
              </a>
              <a
                href={`/api/admin/export?type=${d.type}&format=json`}
                className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
              >
                JSON
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
