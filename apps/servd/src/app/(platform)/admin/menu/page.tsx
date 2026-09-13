import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getMenu } from "@/server/menu/queries";
import { getServingStates } from "@/server/menu/servings";
import { getPosOnlyItemIds } from "@/server/menu/pos-only";
import { formatPeso } from "@/lib/money";
import { AddCategoryForm } from "@/components/admin/AddCategoryForm";
import { AddItemForm } from "@/components/admin/AddItemForm";
import { AddBundleForm } from "@/components/admin/AddBundleForm";
import { CategoryHeader } from "@/components/admin/CategoryHeader";
import { ImportMenuButton } from "@/components/admin/ImportMenuButton";
import { SortableList } from "@/components/admin/SortableList";
import { hasFeature } from "@/server/billing/feature-gate";
import {
  deleteItem,
  toggleItemAvailability,
  reorderCategories,
  reorderItems,
} from "@/server/menu/actions";

// AI menu import calls a vision model, which can take longer than the default
// serverless timeout — give the Server Action room to finish.
export const maxDuration = 60;

export default async function MenuPage() {
  const { restaurantId } = await requireAdminPage();
  const categories = await getMenu(restaurantId);
  const servings = await getServingStates(restaurantId);
  // Counter-only items look identical to every other item in this list, so
  // without a badge an owner has no way to see which ones customers can't
  // actually find.
  const posOnly = await getPosOnlyItemIds(restaurantId);
  // AI menu import is a paid feature (Growth & Business). Gate on both the API
  // key being configured AND the restaurant's plan including it.
  const aiImportEnabled =
    !!process.env.ANTHROPIC_API_KEY && (await hasFeature(restaurantId, "aiMenuImport"));
  const imageGenEnabled = !!process.env.OPENAI_API_KEY;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-plum-ink/50">
            ← Dashboard
          </Link>
          <h1 className="font-heading text-2xl font-bold">Menu</h1>
        </div>
        <div className="flex items-center gap-3">
          {aiImportEnabled && <ImportMenuButton imageGenEnabled={imageGenEnabled} />}
          <Link
            href="/admin/modifiers"
            className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
          >
            Modifier groups →
          </Link>
        </div>
      </div>

      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <AddCategoryForm />
      </div>

      {categories.length > 0 && (
        <AddBundleForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      )}

      {categories.length === 0 && (
        <p className="text-sm text-plum-ink/50">
          No categories yet. Add one above to start building your menu.
        </p>
      )}

      <SortableList
        className="space-y-6"
        onReorder={reorderCategories}
        entries={categories.map((category) => ({
          id: category.id,
          node: (
        <section
          className="rounded-tile border border-plum-ink/10 bg-white p-4"
        >
          <div className="flex items-center justify-between">
            <CategoryHeader id={category.id} name={category.name} />
          </div>

          <SortableList
            className="mt-3 space-y-1"
            onReorder={reorderItems.bind(null, category.id)}
            entries={category.menuItems.map((item) => ({
              id: item.id,
              node: (
              <div
                className="flex flex-col gap-2 border-b border-plum-ink/5 py-3 sm:flex-row sm:items-center sm:gap-3"
              >
                {/* Image · name/price */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-lg bg-cream" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{item.name}</span>
                      {!item.isAvailable && (
                        <span className="rounded-full bg-muted/20 px-2 py-0.5 text-xs text-muted">
                          Out of stock
                        </span>
                      )}
                      {posOnly.has(item.id) && (
                        <span className="rounded-full bg-plum-ink/10 px-2 py-0.5 text-xs font-medium text-plum-ink/70">
                          Counter only
                        </span>
                      )}
                      {/* An item at ₱0 sells for nothing, and an order made
                          entirely of them totals nothing — so no payment is
                          recorded and the sale is invisible to revenue,
                          accounting and the shift report. Almost always a price
                          that was never filled in. */}
                      {item.price === 0 && (
                        <span className="rounded-full bg-guava/15 px-2 py-0.5 text-xs font-bold text-guava">
                          No price set
                        </span>
                      )}
                      {(() => {
                        const cap = servings.get(item.id);
                        if (!cap || cap.remaining == null) return null;
                        return cap.remaining <= 0 ? (
                          <span className="rounded-full bg-guava/15 px-2 py-0.5 text-xs font-medium text-guava">
                            Sold out today
                          </span>
                        ) : (
                          <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-medium text-brand-primary">
                            {cap.remaining} / {cap.dailyLimit} left today
                          </span>
                        );
                      })()}
                    </div>
                    {item.description && (
                      <p className="truncate text-sm text-plum-ink/50">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold">{formatPeso(item.price)}</span>
                </div>

                {/* Actions — own row on phones, inline on larger screens */}
                <div className="flex shrink-0 items-center gap-2 pl-[60px] sm:pl-0">
                  <form action={toggleItemAvailability}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="available" value={(!item.isAvailable).toString()} />
                    <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                      {item.isAvailable ? "Mark out" : "Mark in"}
                    </button>
                  </form>

                  <Link
                    href={`/admin/menu/${item.id}`}
                    className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold"
                  >
                    Edit
                  </Link>

                  <form action={deleteItem} className="ml-auto sm:ml-0">
                    <input type="hidden" name="id" value={item.id} />
                    <button className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:text-guava">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
              ),
            }))}
          />

          <div className="mt-3">
            <AddItemForm categoryId={category.id} />
          </div>
        </section>
        ),
      }))}
    />
    </div>
  );
}
