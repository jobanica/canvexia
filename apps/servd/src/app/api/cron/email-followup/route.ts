import { NextRequest } from "next/server";
import { runFollowUps } from "@/server/email/followup";

/**
 * The acquisition follow-up runner (configured in vercel.json, every 15
 * minutes). Protected by CRON_SECRET, same as the billing cron.
 *
 * Fifteen minutes rather than nightly because the sequence has hour-scale steps
 * — "+2 hours" is meaningless if the runner only wakes at 1 AM. Safe to call as
 * often as you like: the unique (restaurant, step) row is claimed with a
 * status-guarded update, so an overlapping pass sends nothing extra.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runFollowUps());
}
