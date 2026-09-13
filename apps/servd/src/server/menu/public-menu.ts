import { systemDb } from "@/server/tenancy/scoped-db";
import type { DinerCategory } from "@/lib/cart/types";
import { effectivePrice } from "@/lib/pricing/happy-hour";
import { getActiveHappyHours } from "@/server/pricing/happy-hour";
import { getServingStates } from "@/server/menu/servings";
import { getDishStock } from "@/server/inventory/dish-stock";
import { getVariantsMap } from "@/server/menu/variants";
import { getUnavailableModifierIds } from "@/server/menu/modifier-availability";
import { getModifierGroupOrder } from "@/server/menu/modifier-order";
import { sortModifierGroups } from "@/lib/menu/modifier-order";
import { getPosOnlyItemIds } from "@/server/menu/pos-only";
import { variantPrice } from "@/lib/menu/variant-price";

/**
 * Loads a restaurant's full menu for the diner page, by restaurantId. Returns
 * categories → items → modifier groups → options, as plain serializable data.
 *
 * Runs in the trusted system context (diners have no session) but the query is
 * tightly scoped to ONE restaurantId, and includes only diner-relevant fields.
 * Out-of-stock items are returned too (the UI shows them disabled).
 *
 * Counter-only items are left out unless `includePosOnly` is set, which only
 * the cashier's own POS does. They're dropped entirely rather than returned
 * disabled: a diner shouldn't see that a ₱30 takeaway box or a staff meal
 * exists at all. Hiding them here is presentation — the order builder refuses
 * them independently, so a crafted request can't order what the page won't show.
 */
export async function getPublicMenu(
  restaurantId: string,
  locale = "en",
  opts: { includePosOnly?: boolean } = {},
): Promise<DinerCategory[]> {
  const categories = await systemDb((tx) =>
    tx.category.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        translations: { where: { locale } },
        menuItems: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            translations: { where: { locale } },
            modifierGroups: {
              include: {
                group: {
                  // Explicit columns throughout: `isAvailable` on a modifier and
                  // `sortOrder` on a group each arrive in a manual migration, and
                  // a wide include would break the whole menu on a database that
                  // hasn't run them. Both are layered on below from best-effort
                  // queries instead.
                  select: {
                    id: true,
                    name: true,
                    required: true,
                    minSelect: true,
                    maxSelect: true,
                    modifiers: {
                      orderBy: { sortOrder: "asc" },
                      select: { id: true, name: true, priceDelta: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  );

  // Active happy-hour rules → discounted display price (struck-through original).
  const happyHours = await getActiveHappyHours(restaurantId);

  // Daily servings caps — an item that's hit its cap shows as sold out for today.
  const itemIds = categories.flatMap((c) => c.menuItems.map((i) => i.id));
  const servings = await getServingStates(restaurantId, itemIds);
  // Sizes/variants per item (best-effort).
  const variantsMap = await getVariantsMap(itemIds);
  // Add-ons the kitchen marked out — shown disabled rather than hidden, so the
  // diner can see the option exists and is just unavailable right now.
  const modsOut = await getUnavailableModifierIds(restaurantId);
  // The one order for option groups, set on the Modifiers page.
  const groupOrder = await getModifierGroupOrder(restaurantId);
  // Counted stock — a recipe's ingredients or a product's own units. Shown sold
  // out as soon as the last portion is spoken for, not when it's finally
  // cooked: otherwise the shelf reads as full to everyone who loads the page
  // while orders are already in the kitchen.
  const dishStock = await getDishStock(restaurantId, itemIds);

  // Counter-only items — hidden from every diner-facing surface.
  const posOnly = opts.includePosOnly ? new Set<string>() : await getPosOnlyItemIds(restaurantId);

  // A category emptied entirely by that filter goes with it — a "Staff meals"
  // heading with nothing under it advertises the hidden menu it's meant to hide.
  const visible = categories.filter(
    (c) => c.menuItems.length === 0 || c.menuItems.some((i) => !posOnly.has(i.id)),
  );

  // Overlay the requested locale's translations, falling back to base text.
  return visible.map((c) => ({
    id: c.id,
    name: c.translations[0]?.name ?? c.name,
    items: c.menuItems.filter((i) => !posOnly.has(i.id)).map((item) => {
      const eff = effectivePrice(item.price, { id: item.id, categoryId: item.categoryId }, happyHours);
      // Out of daily servings → sold out for the rest of today.
      const cap = servings.get(item.id);
      const cappedOut = cap?.remaining != null && cap.remaining <= 0;
      // Nothing left to make it from (or all of it promised to open orders).
      const stockOut = dishStock.get(item.id)?.soldOut === true;
      // Sizes/variants: each priced through happy-hour like the base price.
      const rawVariants = variantsMap.get(item.id) ?? [];
      const variants = rawVariants.map((v) => ({
        id: v.id,
        name: v.name,
        // Same fallback the order builder uses, so the price on the card is the
        // price that gets charged.
        price: effectivePrice(
          variantPrice(v.price, item.price),
          { id: item.id, categoryId: item.categoryId },
          happyHours,
        ).price,
        stock: v.stock,
      }));
      // For variant items, the card shows the lowest size as the "from" price.
      const fromPrice = variants.length > 0 ? Math.min(...variants.map((v) => v.price)) : eff.price;
      // If every size is out of stock, the whole item is sold out.
      const allSizesOut = variants.length > 0 && variants.every((v) => v.stock != null && v.stock <= 0);
      return {
      id: item.id,
      name: item.translations[0]?.name ?? item.name,
      description: item.translations[0]?.description ?? item.description,
      price: fromPrice,
      originalPrice: eff.discount > 0 && variants.length === 0 ? eff.originalPrice : null,
      ...(variants.length > 0 ? { variants } : {}),
      imageUrl: item.imageUrl,
      videoUrl: item.videoUrl,
      videoPosterUrl: item.videoPosterUrl,
      isAvailable: item.isAvailable && !cappedOut && !allSizesOut && !stockOut,
      // The two reasons, kept apart. Only the cashier POS reads these — its
      // sold-out button moves the hand switch, so it has to know whether the
      // switch is what's holding the item down or whether something ran out.
      manualOut: !item.isAvailable,
      autoOut: cappedOut || allSizesOut || stockOut,
      dietaryTags: item.dietaryTags ?? [],
      // Sorted by the order set on the Modifiers page, so every item asks the
      // same questions in the same sequence.
      groups: sortModifierGroups(
        item.modifierGroups.map((link) => ({
          ...link.group,
          sortOrder: groupOrder.get(link.group.id) ?? null,
        })),
      ).map((group) => ({
        id: group.id,
        name: group.name,
        required: group.required,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        modifiers: group.modifiers.map((m) => ({
          id: m.id,
          name: m.name,
          priceDelta: m.priceDelta,
          isAvailable: !modsOut.has(m.id),
        })),
      })),
      };
    }),
  }));
}
