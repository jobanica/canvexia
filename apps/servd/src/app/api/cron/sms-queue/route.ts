import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { drainCampaigns } from "@/server/partners/sms-campaigns";

/**
 * Send whatever campaign work is due. Every 10 minutes.
 *
 * TEN MINUTES, not hourly: a campaign scheduled for 9am should go out at
 * roughly 9am, and an hour of drift makes "send at 9" meaningless. It is also
 * cheap — one indexed query when nothing is due, which is almost always.
 *
 * The drainer claims each campaign before sending, so overlapping ticks cannot
 * double-send. It sends at most one batch per campaign per tick, which keeps a
 * two-thousand-person campaign from turning one invocation into a ten-minute
 * function that the platform kills half way through.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = new Date();
  const result = await drainCampaigns(startedAt);

  try {
    await systemDb((tx) =>
      tx.cronRun.create({
        data: {
          job: "sms-queue",
          startedAt,
          finishedAt: new Date(),
          ok: true,
          detail: { ...result },
        },
      }),
    );
  } catch {
    /* the messages went out either way */
  }

  return Response.json(result);
}
