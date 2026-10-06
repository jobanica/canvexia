import { NextResponse } from "next/server";
import { retryWaitingEvents } from "@/server/events/ingest";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron: replay events still waiting for their customer.
 *
 * Normally a waiting event is replayed the moment its signup is processed.
 * This catches the race where both arrive at once and neither transaction can
 * see the other's row. Guarded by CRON_SECRET, which Vercel sends as a bearer
 * token — the same arrangement as apps/servd/src/app/api/cron/billing.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await retryWaitingEvents());
}
