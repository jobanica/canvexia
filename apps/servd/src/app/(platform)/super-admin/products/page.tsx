import { PRODUCTS, liveProducts } from "@servd/core";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";

/**
 * The CANVEXIA product catalogue, read straight from the registry in
 * @servd/core rather than from a table.
 *
 * It is code, not data, because a product only exists once something can
 * actually provision a merchant into it — and that is an adapter someone
 * writes, not a row someone inserts. A registry that could be edited here would
 * let HQ list a product the platform cannot create an account in, and the
 * partner who tried would be the one to find out.
 */
export default async function SuperAdminProductsPage() {
  await requireSuperAdminPage();
  const products = Object.values(PRODUCTS);
  const live = liveProducts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Products</h1>
        <p className="text-sm text-plum-ink/50">
          {live.length} of {products.length} products can take merchants today.
        </p>
      </div>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <ul className="divide-y divide-plum-ink/5">
          {products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {p.name}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.live ? "bg-mango/15 text-mango" : "bg-plum-ink/5 text-plum-ink/50"
                    }`}
                  >
                    {p.live ? "live" : "not yet"}
                  </span>
                </p>
                <p className="text-xs text-plum-ink/45">{p.description}</p>
              </div>
              <code className="text-xs text-plum-ink/40">{p.id}</code>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-plum-ink/40">
          A product turns live when it implements the provisioning adapter — until then it is listed
          so partners can see what is coming, not so merchants can be created in it. Edit the
          registry in{" "}
          <code className="rounded bg-plum-ink/5 px-1">packages/core/src/products/registry.ts</code>.
        </p>
      </section>
    </div>
  );
}
