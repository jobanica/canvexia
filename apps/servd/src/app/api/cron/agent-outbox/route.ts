import { NextRequest } from "next/server";
import { flushOutbox } from "@/server/agent-portal/outbox";

export const dynamic = "force-dynamic";

/**
 * Deliver queued agent-portal events (vercel.json: every 5 minutes). The
 * inline flush after a signup or receipt handles the normal case; this is
 * what delivers everything that failed or was queued while the portal was
 * down or not configured yet.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await flushOutbox(100));
}
