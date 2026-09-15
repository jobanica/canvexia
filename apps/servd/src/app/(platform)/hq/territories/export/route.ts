import { NextResponse } from "next/server";
import { getCurrentHqUser } from "@/server/hq/auth";
import { hqCan } from "@servd/core";
import { exportTerritoriesCsv } from "@/server/hq/territories";

/**
 * Download every territory as CSV.
 *
 * A route handler, not a server action: the response IS the file, and an action
 * cannot set Content-Disposition. Gated here rather than by the layout, because
 * a route handler does not run inside one — this URL is reachable directly.
 */
export async function GET() {
  const user = await getCurrentHqUser();
  if (!user || !hqCan(user.role, "territories.write")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const csv = await exportTerritoriesCsv();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="canvexia-territories-${stamp}.csv"`,
    },
  });
}
