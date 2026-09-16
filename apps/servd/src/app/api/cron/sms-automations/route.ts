import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { runAutomations } from "@/server/partners/sms-automations";

/**
 * The three automations. Once a day, at 10:00 Manila.
 *
 * 02:00 UTC, which is 10:00 in Manila — INSIDE the default send window, so a
 * partner's automations do not all sit waiting for the window to open. A job
 * scheduled at a UTC hour that lands at 3am Manila would produce nothing every
 * day and look like a broken feature.
 *
 * Daily rather than hourly because all three are "N days after X" rules: an
 * hourly run would do the same work twenty-four times and send nothing extra.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = new Date();
  const result = await runAutomations(startedAt);

  try {
    await systemDb((tx) =>
      tx.cronRun.create({
        data: {
          job: "sms-automations",
          startedAt,
          finishedAt: new Date(),
          ok: true,
          detail: { ...result },
        },
      }),
    );
  } catch {
    /* the texts went out either way */
  }

  return Response.json(result);
}
