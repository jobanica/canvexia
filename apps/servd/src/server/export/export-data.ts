import "server-only";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Tenant data export. Read-only, strictly scoped to the caller's restaurant.
 * Returns arrays of flat rows the route handler serialises to CSV/JSON.
 */
export type ExportType = "orders" | "menu" | "customers";

export function isExportType(v: string): v is ExportType {
  return v === "orders" || v === "menu" || v === "customers";
}

export async function getExportRows(
  restaurantId: string,
  type: ExportType,
): Promise<Record<string, string | number>[]> {
  if (type === "orders") {
    const orders = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 20_000,
        select: {
          id: true,
          createdAt: true,
          status: true,
          paymentStatus: true,
          orderType: true,
          orderNumber: true,
          total: true,
          discountAmount: true,
          creditApplied: true,
          tipAmount: true,
          table: { select: { tableNumber: true } },
          _count: { select: { items: true } },
        },
      }),
    );
    return orders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      paymentStatus: o.paymentStatus,
      orderType: o.orderType,
      orderNumber: o.orderNumber ?? "",
      table: o.table?.tableNumber ?? "",
      items: o._count.items,
      grossPesos: (o.total / 100).toFixed(2),
      discountPesos: (o.discountAmount / 100).toFixed(2),
      giftCardPesos: (o.creditApplied / 100).toFixed(2),
      tipPesos: (o.tipAmount / 100).toFixed(2),
      netPesos: (Math.max(0, o.total - o.discountAmount - o.creditApplied) / 100).toFixed(2),
    }));
  }

  if (type === "menu") {
    const cats = await tenantDb(restaurantId, (tx) =>
      tx.category.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          name: true,
          menuItems: {
            orderBy: [{ sortOrder: "asc" }],
            select: { name: true, price: true, isAvailable: true, dietaryTags: true, description: true },
          },
        },
      }),
    );
    const rows: Record<string, string | number>[] = [];
    for (const c of cats) {
      for (const i of c.menuItems) {
        rows.push({
          category: c.name,
          item: i.name,
          pricePesos: (i.price / 100).toFixed(2),
          available: i.isAvailable ? "yes" : "no",
          tags: (i.dietaryTags ?? []).join("|"),
          description: i.description ?? "",
        });
      }
    }
    return rows;
  }

  // customers
  const customers = await tenantDb(restaurantId, (tx) =>
    tx.customerContact.findMany({
      orderBy: { createdAt: "desc" },
      take: 50_000,
      select: { name: true, phone: true, marketingConsent: true, consentSource: true, createdAt: true },
    }),
  );
  return customers.map((c) => ({
    name: c.name ?? "",
    phone: c.phone,
    marketingConsent: c.marketingConsent,
    consentSource: c.consentSource ?? "",
    createdAt: c.createdAt.toISOString(),
  }));
}

/** Serialise rows to CSV (RFC-4180-ish quoting). */
export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\r\n");
}
