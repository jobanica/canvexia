import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { listHappyHours, toggleHappyHour, deleteHappyHour } from "@/server/pricing/happy-hour";
import { getMenu } from "@/server/menu/queries";
import { HappyHourForm } from "@/components/admin/HappyHourForm";
import { DAY_LABELS, minutesToHHMM } from "@/lib/pricing/happy-hour";
import { formatPeso } from "@/lib/money";

/**
 * Happy hour / scheduled pricing — time-windowed automatic discounts on items
 * or categories. The discount is applied server-side at order time and shown on
 * the diner menu while active.
 */
export default async function HappyHoursPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "promotions", "Happy hours");
  if (locked) return locked;

  const [rules, menu] = await Promise.all([listHappyHours(restaurantId), getMenu(restaurantId)]);
  const categories = menu.map((c) => ({ id: c.id, name: c.name }));
  const items = menu.flatMap((c) => c.menuItems.map((i) => ({ id: i.id, name: i.name })));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const itemName = new Map(items.map((i) => [i.id, i.name]));

  function scopeLabel(r: (typeof rules)[number]) {
    if (r.scope === "all") return "Whole menu";
    const names = r.targetIds
      .map((id) => (r.scope === "category" ? catName.get(id) : itemName.get(id)))
      .filter(Boolean);
    return `${r.scope === "category" ? "Categories" : "Items"}: ${names.join(", ") || "—"}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Happy hour</h1>
        <p className="text-sm text-plum-ink/50">
          Automatic time-windowed discounts. While active, prices drop on the diner menu and at
          checkout — no coupon code needed.
        </p>
      </div>

      <HappyHourForm categories={categories} items={items} />

      <div className="space-y-3">
        {rules.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No happy hours yet. Add one above.</p>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-plum-ink/10 bg-white p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold">{r.name}</span>
                  <span className="rounded-full bg-mango/15 px-2 py-0.5 text-xs font-semibold text-mango">
                    {r.discountType === "percent" ? `${r.value}% off` : `${formatPeso(r.value)} off`}
                  </span>
                  {!r.active && (
                    <span className="rounded-full bg-plum-ink/10 px-2 py-0.5 text-xs text-plum-ink/50">Paused</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-plum-ink/55">
                  {minutesToHHMM(r.startMinute)}–{minutesToHHMM(r.endMinute)} ·{" "}
                  {r.days.length ? r.days.map((d) => DAY_LABELS[d]).join(", ") : "Every day"} · {scopeLabel(r)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <form action={toggleHappyHour}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="active" value={String(r.active)} />
                  <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                    {r.active ? "Pause" : "Resume"}
                  </button>
                </form>
                <form action={deleteHappyHour}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-xs text-muted hover:text-guava">Delete</button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
