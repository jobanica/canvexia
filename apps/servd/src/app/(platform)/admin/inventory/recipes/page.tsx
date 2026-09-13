import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { listRecipes, listRecipeIngredients } from "@/server/inventory/queries";
import { RecipeEditor } from "@/components/admin/inventory/RecipeEditor";

/**
 * Recipes — what each dish is made of.
 *
 * The missing half of ingredient tracking. Stock deduction, weighted-average
 * costing and COGS were all built and working, and none of them ever moved a
 * gram, because there was no screen anywhere to say that an adobo uses 250g of
 * pork. This is that screen.
 */
export default async function RecipesPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "inventory", "Recipes");
  if (locked) return locked;

  const [rows, ingredients, restaurant] = await Promise.all([
    listRecipes(restaurantId),
    listRecipeIngredients(restaurantId),
    tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { autoOutOfStock: true } }),
    ).catch(() => ({ autoOutOfStock: false })),
  ]);

  const withRecipe = rows.filter((r) => r.components.length > 0).length;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/inventory" className="text-sm text-plum-ink/50">← Inventory</Link>
        <h1 className="font-heading text-2xl font-bold">Recipes</h1>
        <p className="text-sm text-plum-ink/50">
          What each dish is made of. Sell it, and these ingredients come off your stock
          automatically.
        </p>
      </div>

      {/* How it works — short, because this is the one screen where the
          mechanism isn't obvious from looking at it. */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-4 text-sm text-plum-ink/70">
        <p className="font-heading font-bold text-plum-ink">How automatic deduction works</p>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Add your ingredients under <strong>Inventory → Ingredients</strong>, with a unit and a cost.</li>
          <li>Here, list what one serving of a dish uses — e.g. Adobo uses 0.25 kg pork, 2 pcs garlic.</li>
          <li>
            When the kitchen marks that order <strong>done</strong>, every ingredient comes off by
            the quantity sold, and the cost lands in your COGS.
          </li>
        </ol>
        <p className="mt-2 text-xs text-plum-ink/50">
          {restaurant.autoOutOfStock ? (
            <>Auto out-of-stock is <strong>on</strong>: a dish comes off the menu by itself when an
            ingredient it needs runs out.</>
          ) : (
            <>Auto out-of-stock is off. Turn it on under Inventory settings to have dishes come off
            the menu by themselves when an ingredient runs out.</>
          )}
        </p>
      </div>

      {rows.length > 0 && (
        <p className="text-xs text-plum-ink/45">
          {withRecipe} of {rows.length} dishes have a recipe. The rest move no stock when sold.
        </p>
      )}

      <RecipeEditor rows={rows} ingredients={ingredients} />
    </div>
  );
}
