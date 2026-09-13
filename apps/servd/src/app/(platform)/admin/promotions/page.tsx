import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getPromotions } from "@/server/promotions/queries";
import { getMenu } from "@/server/menu/queries";
import { deletePromotion, togglePromotion } from "@/server/promotions/actions";
import { AddPromotionForm } from "@/components/admin/AddPromotionForm";
import { offerSummary } from "@/lib/promotions/compute";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";

export default async function PromotionsPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "promotions", "Promotions");
  if (locked) return locked;
  const [promotions, menu] = await Promise.all([
    getPromotions(restaurantId),
    getMenu(restaurantId),
  ]);
  const menuItems = menu.flatMap((c) => c.menuItems.map((i) => ({ id: i.id, name: i.name })));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Promotions</h1>
        <p className="text-sm text-plum-ink/50">
          Create coupon offers customers redeem at checkout with a code. Active ones show in the
          diner app under <strong>Promos</strong>.
        </p>
      </div>

      <AddPromotionForm menuItems={menuItems} />

      {promotions.length === 0 ? (
        <p className="text-sm text-plum-ink/50">No promotions yet. Add one above.</p>
      ) : (
        <ul className="space-y-2">
          {promotions.map((p) => {
            const summary = offerSummary({
              type: p.type,
              value: p.value,
              freeItemId: p.freeItemId,
              minSpend: p.minSpend,
            });
            const expired = p.expiresAt && new Date(p.expiresAt).getTime() < Date.now();
            return (
              <li
                key={p.id}
                className="flex items-start gap-3 rounded-tile border border-plum-ink/10 bg-white px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading font-bold">{p.title}</span>
                    {summary && (
                      <span className="rounded-full bg-mango/15 px-2 py-0.5 text-xs font-semibold text-mango">
                        {summary}
                      </span>
                    )}
                    {p.code && (
                      <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-brand-primary">
                        {p.code}
                      </span>
                    )}
                    {!p.active && (
                      <span className="rounded-full bg-plum-ink/5 px-2 py-0.5 text-xs font-semibold text-plum-ink/50">
                        Cancelled
                      </span>
                    )}
                    {expired && (
                      <span className="rounded-full bg-guava/15 px-2 py-0.5 text-xs font-semibold text-guava">
                        Expired
                      </span>
                    )}
                  </div>
                  {p.description && <p className="mt-0.5 text-sm text-plum-ink/55">{p.description}</p>}
                  <p className="mt-0.5 text-xs text-plum-ink/40">
                    {p.minSpend > 0 && `Min spend ${formatPeso(p.minSpend)} · `}
                    {p.expiresAt && `Expires ${manilaDate(p.expiresAt)}`}
                  </p>
                </div>
                <form action={togglePromotion}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value={String(p.active)} />
                  <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                    {p.active ? "Cancel" : "Reactivate"}
                  </button>
                </form>
                <form action={deletePromotion}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-xs text-muted hover:text-guava">Delete</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
