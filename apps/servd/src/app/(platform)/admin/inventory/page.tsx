import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import {
  isProductStockReady,
  listIngredients,
  listProductStock,
  listSuppliers,
  getInventoryReport,
} from "@/server/inventory/queries";
import { formatPeso } from "@/lib/money";
import { AddInventoryItemForm } from "@/components/admin/inventory/AddInventoryItemForm";
import { AddSupplierForm } from "@/components/admin/inventory/AddSupplierForm";
import { InventoryTable } from "@/components/admin/inventory/InventoryTable";
import { InventoryTabs } from "@/components/admin/inventory/InventoryTabs";
import { ProductStockTable } from "@/components/admin/inventory/ProductStockTable";
import { deleteSupplier, setAutoOutOfStock, setLowStockAlertPhone } from "@/server/inventory/actions";

export default async function InventoryPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "inventory", "Inventory");
  if (locked) return locked;

  const from = new Date();
  from.setDate(from.getDate() - 30);
  const [items, products, stockReady, suppliers, report, restaurant] = await Promise.all([
    listIngredients(restaurantId),
    listProductStock(restaurantId),
    isProductStockReady(restaurantId),
    listSuppliers(restaurantId),
    getInventoryReport(restaurantId, from, new Date()),
    tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { autoOutOfStock: true, lowStockAlertPhone: true } }),
    ),
  ]);
  const cogs = report.reduce((s, r) => s + r.cogs, 0);
  const tracked = products.filter((p) => p.inventoryItemId != null);

  // One low-stock list across both kinds of stock. Somebody minding a shelf
  // doesn't care whether the thing running out is a product or an ingredient.
  const lowItems = [
    ...tracked.filter((p) => p.low).map((p) => ({ id: p.menuItemId, name: p.name, stockQty: p.stockQty, unit: p.unit })),
    ...items.filter((i) => i.low).map((i) => ({ id: i.id, name: i.name, stockQty: i.stockQty, unit: i.unit })),
  ];
  const stockValue =
    items.reduce((s, i) => s + i.stockQty * i.costPerUnit, 0) +
    tracked.reduce((s, p) => s + p.stockQty * p.costPerUnit, 0);

  const rows = items.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    stockQty: i.stockQty,
    costPerUnit: i.costPerUnit,
    reorderLevel: i.reorderLevel,
    low: i.low,
    supplierName: i.supplier?.name ?? null,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
          <h1 className="font-heading text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-plum-ink/50">
            Count stock per product, or by ingredient — plus waste and cost of goods.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/inventory/reorder" className="rounded-full px-4 py-2 text-sm font-semibold btn-brand">
            🛒 Reorder suggestions →
          </Link>
          <Link href="/admin/inventory/recipes" className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
            🍳 Recipes →
          </Link>
          <Link href="/admin/inventory/po" className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
            Purchase orders →
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Products tracked" value={`${tracked.length} / ${products.length}`} />
        <Kpi label="Low stock" value={String(lowItems.length)} tone={lowItems.length > 0 ? "bad" : "ok"} />
        <Kpi label="Stock value" value={formatPeso(Math.round(stockValue))} />
        <Kpi label="COGS (30d)" value={formatPeso(Math.round(cogs))} />
      </div>

      {/* Needs attention — the most important thing on the page. */}
      {lowItems.length > 0 && (
        <div className="rounded-tile border border-guava/30 bg-guava/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-heading font-bold text-plum-ink">
              ⚠️ {lowItems.length} item{lowItems.length === 1 ? "" : "s"} at or below reorder level
            </p>
            <Link href="/admin/inventory/reorder" className="text-sm font-bold text-brand-primary">
              Review &amp; reorder →
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lowItems.slice(0, 12).map((i) => (
              <span key={i.id} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-plum-ink ring-1 ring-guava/25">
                {i.name} · {i.stockQty} {i.unit}
              </span>
            ))}
            {lowItems.length > 12 && (
              <span className="px-1 py-1 text-xs text-plum-ink/50">+{lowItems.length - 12} more</span>
            )}
          </div>
        </div>
      )}

      {/* Stock, one tab per way of keeping it. */}
      <InventoryTabs
        productCount={products.length}
        ingredientCount={items.length}
        products={
          stockReady ? (
            <ProductStockTable rows={products} />
          ) : (
            <div className="rounded-tile border border-mango/40 bg-mango/5 p-5">
              <p className="font-heading font-bold text-plum-ink">One database update needed</p>
              <p className="mt-1 text-sm text-plum-ink/70">
                Counting stock per product needs a column this database doesn&apos;t have yet. Run{" "}
                <code className="rounded bg-white px-1.5 py-0.5 text-xs">
                  prisma/manual/add-product-stock.sql
                </code>{" "}
                in the Supabase SQL editor, then reload this page. Ingredients keep working in the
                meantime.
              </p>
            </div>
          )
        }
        ingredients={
          <div className="space-y-3">
            <InventoryTable items={rows} />
            <Panel title="➕ Add ingredient" hint="Create a new ingredient to track">
              <AddInventoryItemForm suppliers={suppliers} />
            </Panel>
          </div>
        }
      />

      <Panel title="🚚 Suppliers" hint={`${suppliers.length} saved`}>
        <AddSupplierForm />
        {suppliers.length > 0 ? (
          <ul className="mt-3 divide-y divide-plum-ink/10">
            {suppliers.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-plum-ink">{s.name}</span>
                <form action={deleteSupplier}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-xs font-semibold text-plum-ink/45 hover:text-guava">remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-plum-ink/45">No suppliers yet.</p>
        )}
      </Panel>

      <Panel title="⚙️ Inventory settings" hint="Auto out-of-stock and alerts">
        <form action={setAutoOutOfStock} className="border-b border-plum-ink/10 pb-4">
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input type="checkbox" name="autoOutOfStock" defaultChecked={restaurant.autoOutOfStock} className="mt-0.5" />
            <span>
              Take items off sale automatically when stock hits zero
              <span className="mt-0.5 block text-xs font-normal text-plum-ink/50">
                A tracked product stops being orderable when its count reaches zero, and a dish
                stops when an ingredient it needs runs out — until you restock.
              </span>
            </span>
          </label>
          <button className="mt-2 rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Save</button>
        </form>

        <form action={setLowStockAlertPhone} className="pt-4">
          <label className="block text-sm font-semibold text-plum-ink">Low-stock SMS alert phone</label>
          <p className="mb-2 text-xs text-plum-ink/50">
            Get a text the moment anything drops to its reorder level (needs SMS configured).
            Leave blank to turn off.
          </p>
          <div className="flex gap-2">
            <input
              name="lowStockAlertPhone"
              defaultValue={restaurant.lowStockAlertPhone ?? ""}
              placeholder="09XX XXX XXXX"
              className="w-56 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
            <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Save</button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function Kpi({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    // Two across on a phone: stacked, four tiles filled the entire first
    // screen and pushed the stock list — the thing you came for — out of sight.
    <div className="min-w-0 rounded-tile border border-plum-ink/10 bg-white p-3">
      <p className="truncate text-[11px] font-medium text-plum-ink/50">{label}</p>
      <p className={`font-heading text-lg font-extrabold sm:text-2xl ${tone === "bad" ? "text-guava" : "text-plum-ink"}`}>
        {value}
      </p>
    </div>
  );
}

/** Collapsible tool section — keeps setup/settings out of the way of daily use. */
function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-tile border border-plum-ink/10 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4">
        <span className="font-heading font-bold text-plum-ink">{title}</span>
        <span className="flex items-center gap-2 text-xs text-plum-ink/45">
          {hint}
          <span className="transition group-open:rotate-180" aria-hidden>▾</span>
        </span>
      </summary>
      <div className="border-t border-plum-ink/10 p-4">{children}</div>
    </details>
  );
}
