import { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { hasFeature } from "@/server/billing/feature-gate";
import { getExportRows, toCsv, isExportType } from "@/server/export/export-data";

/**
 * Tenant data export: /api/admin/export?type=orders|menu|customers&format=csv|json
 * Admin-only, scoped to the caller's own restaurant, gated on the dataExport
 * feature. Streams a downloadable file.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await hasFeature(user.restaurantId, "dataExport"))) {
    return new Response("Upgrade required", { status: 402 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "";
  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  if (!isExportType(type)) return new Response("Bad type", { status: 400 });

  const rows = await getExportRows(user.restaurantId, type);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `servd-${type}-${stamp}.${format}`;

  const body = format === "json" ? JSON.stringify(rows, null, 2) : toCsv(rows);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": format === "json" ? "application/json" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
