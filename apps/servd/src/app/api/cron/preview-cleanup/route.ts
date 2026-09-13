import { NextRequest } from "next/server";
import { runPreviewCleanup } from "@/server/build/cleanup";
import { purgeOldShifts } from "@/server/orders/shift-purge";

/**
 * Nightly housekeeping. Protected by CRON_SECRET, same as the billing cron.
 *
 * Two unrelated jobs share the slot because both are "delete what nobody needs
 * any more" and neither is worth its own cron entry. They're kept independent:
 * one failing must not stop the other, since a skipped housekeeping run should
 * cost a day of tidiness, not a week.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const [previews, shifts] = await Promise.all([
    runPreviewCleanup().catch(() => null),
    purgeOldShifts().catch(() => null),
  ]);
  return Response.json({ previews, shifts });
}
