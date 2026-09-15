import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { drainOutbox } from "@/server/email/outbox";

/**
 * Send whatever is waiting in `outbound_emails`. Every 15 minutes.
 *
 * FIFTEEN MINUTES, matching email-followup, rather than hourly or daily. The
 * queue holds a welcome email somebody is waiting on to get into their account;
 * an hour of silence after being approved reads as "it did not work" and
 * produces a support message. It is also cheap: the job is a no-op that costs
 * one indexed query when the queue is empty, which it usually is.
 *
 * ONE BATCH PER TICK, capped at Resend's own limit of 100. A backlog drains at
 * 400 an hour, which clears anything this product can realistically produce,
 * and the cap means a bad backlog cannot turn one tick into a ten-minute
 * function.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://canvexia-two.vercel.app";
  const result = await drainOutbox(appUrl);

  // Recorded even when it did nothing, and ESPECIALLY when it is unconfigured:
  // "no email provider is set" and "the job stopped running" produced identical
  // evidence before this table was written to, which is the hole CRON_SECRET
  // sat in for the whole of H6.
  try {
    await systemDb((tx) =>
      tx.cronRun.create({
        data: {
          job: "drain-emails",
          startedAt,
          finishedAt: new Date(),
          ok: result.failed === 0,
          detail: { ...result },
        },
      }),
    );
  } catch {
    /* the mail went out either way; the record of the run is secondary */
  }

  return Response.json(result);
}
