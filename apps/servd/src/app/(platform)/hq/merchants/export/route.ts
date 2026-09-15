import { NextRequest, NextResponse } from "next/server";
import { hqCan } from "@servd/core";
import { getCurrentHqUser } from "@/server/hq/auth";
import { exportMerchantsCsv } from "@/server/hq/merchants";

/** The directory's export. Gated here: a route handler runs outside the layout. */
export async function GET(req: NextRequest) {
  const user = await getCurrentHqUser();
  if (!user || !hqCan(user.role, "partners.read")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const p = req.nextUrl.searchParams;
  const csv = await exportMerchantsCsv({
    partnerId: p.get("partner") ?? undefined,
    productId: p.get("product") ?? undefined,
    status: p.get("status") ?? undefined,
    q: p.get("q") ?? undefined,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="canvexia-merchants-${stamp}.csv"`,
    },
  });
}
