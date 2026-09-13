import { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { parseReportRange } from "@/lib/time/report-range";

/** Minimal CSV cell escaping. */
function cell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

/**
 * Tenant-scoped CSV export.
 *
 * ?type=orders|items, plus either &range=<preset> or &from=YYYY-MM-DD&to=…,
 * matching the report screen exactly — an export that silently used a
 * different window from the page it was launched from is a spreadsheet
 * somebody trusts and shouldn't.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") === "items" ? "items" : "orders";
  const sp = req.nextUrl.searchParams;
  const { from, to, fromKey, toKey } = parseReportRange({
    range: sp.get("range") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });

  let csv: string;
  if (type === "items") {
    const rows = await tenantDb(user.restaurantId, (tx) =>
      tx.$queryRaw<{ name: string; qty: number; revenue: number }[]>`
        select oi."nameAtTime" as name, sum(oi.quantity)::int as qty,
               sum(oi.quantity * oi."unitPrice")::float8 as revenue
        from order_items oi join orders o on o.id = oi."orderId"
        where o."restaurantId" = ${user.restaurantId}
          and o."paymentStatus" = 'paid'
          and o."createdAt" between ${from} and ${to}
        group by oi."nameAtTime" order by qty desc`,
    );
    csv = toCsv(
      ["item", "quantity", "revenue_php"],
      rows.map((r) => [r.name, r.qty, (r.revenue / 100).toFixed(2)]),
    );
  } else {
    const orders = await tenantDb(user.restaurantId, (tx) =>
      tx.order.findMany({
        where: { createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: "desc" },
        include: { table: { select: { tableNumber: true } }, _count: { select: { items: true } } },
      }),
    );
    csv = toCsv(
      ["created_at", "order_id", "table", "status", "payment_status", "items", "total_php"],
      orders.map((o) => [
        o.createdAt.toISOString(),
        o.id,
        o.table?.tableNumber ?? "",
        o.status,
        o.paymentStatus,
        o._count.items,
        (o.total / 100).toFixed(2),
      ]),
    );
  }

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="servd-${type}-${fromKey}_to_${toKey}.csv"`,
    },
  });
}
