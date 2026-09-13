import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getItem, getCategories, getModifierGroups } from "@/server/menu/queries";
import { getMenuItemCost } from "@/server/menu/cost";
import { getServingStates } from "@/server/menu/servings";
import { getItemVariants } from "@/server/menu/variants";
import { VariantEditor } from "@/components/admin/VariantEditor";
import { formatDelta } from "@/lib/money";
import { EditItemForm } from "@/components/admin/EditItemForm";
import { getPosOnlyItemIds } from "@/server/menu/pos-only";
import { ItemTranslationForm } from "@/components/admin/ItemTranslationForm";
import { setItemModifierGroup } from "@/server/menu/actions";
import { LOCALES, DEFAULT_LOCALE, LOCALE_LABELS } from "@/i18n/locales";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const { restaurantId } = await requireAdminPage();

  const [item, categories, allGroups, translations] = await Promise.all([
    getItem(restaurantId, itemId),
    getCategories(restaurantId),
    getModifierGroups(restaurantId),
    tenantDb(restaurantId, (tx) =>
      tx.menuItemTranslation.findMany({ where: { menuItemId: itemId } }),
    ),
  ]);
  if (!item) notFound();

  const foodCost = await getMenuItemCost(restaurantId, itemId);
  // Read on its own: the column ships as a hand-run migration, and a missing
  // one should cost the checkbox, not the whole edit page.
  const posOnly = (await getPosOnlyItemIds(restaurantId)).has(itemId);
  const servingState = (await getServingStates(restaurantId, [itemId])).get(itemId);
  const variants = await getItemVariants(restaurantId, itemId);
  const translationByLocale = new Map(translations.map((tr) => [tr.locale, tr]));

  const attachedIds = new Set(item.modifierGroups.map((g) => g.modifierGroupId));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/menu" className="text-sm text-plum-ink/50">
          ← Menu
        </Link>
        <h1 className="font-heading text-2xl font-bold">{item.name}</h1>
      </div>

      <EditItemForm
        item={{
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description,
          price: item.price,
          cost: foodCost,
          isAvailable: item.isAvailable,
          imageUrl: item.imageUrl,
          videoUrl: item.videoUrl,
          dailyLimit: servingState?.dailyLimit ?? null,
          posOnly,
        }}
        categories={categories}
      />

      <VariantEditor itemId={item.id} initial={variants} />

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Modifier groups</h2>
        <p className="text-sm text-plum-ink/50">
          Choose which option sets apply to this item.{" "}
          <Link href="/admin/modifiers" className="text-brand-primary">
            Manage groups
          </Link>
        </p>

        {allGroups.length === 0 && (
          <p className="mt-3 text-sm text-plum-ink/50">
            No modifier groups exist yet.
          </p>
        )}

        <ul className="mt-3 space-y-2">
          {allGroups.map((group) => {
            const attached = attachedIds.has(group.id);
            return (
              <li
                key={group.id}
                className="flex items-center justify-between rounded-lg bg-cream/60 px-3 py-2"
              >
                <div>
                  <span className="font-medium">{group.name}</span>
                  <span className="ml-2 text-xs text-plum-ink/50">
                    {group.modifiers
                      .map((m) => `${m.name}${formatDelta(m.priceDelta)}`)
                      .join(", ") || "no options yet"}
                  </span>
                </div>
                <form action={setItemModifierGroup}>
                  <input type="hidden" name="menuItemId" value={item.id} />
                  <input type="hidden" name="modifierGroupId" value={group.id} />
                  <input
                    type="hidden"
                    name="attach"
                    value={(!attached).toString()}
                  />
                  <button
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      attached
                        ? "border border-plum-ink/15"
                        : "btn-brand text-white"
                    }`}
                  >
                    {attached ? "Remove" : "Attach"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Translations</h2>
        <p className="text-sm text-plum-ink/50">
          Optional translated name/description per language. Diners see these in
          their chosen language, falling back to the default.
        </p>
        <div className="mt-3 space-y-3">
          {LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((l) => {
            const tr = translationByLocale.get(l);
            return (
              <ItemTranslationForm
                key={l}
                menuItemId={item.id}
                locale={l}
                localeLabel={LOCALE_LABELS[l]}
                initial={{ name: tr?.name ?? "", description: tr?.description ?? "" }}
              />
            );
          })}
        </div>
      </section>

    </div>
  );
}
