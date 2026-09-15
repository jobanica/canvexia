import { NextRequest } from "next/server";
import { monthKeyOf, previousMonth } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";
import { freezeCommission } from "@/server/partners/commissions";

/**
 * Freeze last month's staff commissions. Runs on the 1st, beside the partner
 * statements.
 *
 * THE MONTH IS COMPUTED FROM THE KEY, not from "now minus a day" — the same
 * reasoning as freeze-statements, and the same schedule (01:00 UTC on the 1st,
 * which is 09:00 Manila and unambiguously the 1st there). Vercel Cron is
 * UTC-only; a job that fires at 16:00 UTC on the 1st is running on the 2nd in
 * Manila and would freeze the month that had just started.
 *
 * IDEMPOTENT. `freezeCommission` never recomputes a statement that exists, so a
 * re-run after a failure cannot pay anybody twice or rewrite a figure somebody
 * has already been paid against.
 *
 * ONE TRANSACTION PER SEAT. A single transaction over every seat means one bad
 * row leaves nobody with a statement.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const month = previousMonth(monthKeyOf(new Date()));
  const startedAt = new Date();

  // Only seats that HAVE a rule. A partner with no commission arrangement at
  // all should not accumulate a statement per person per month forever.
  const seats = await systemDb((tx) =>
    tx.commissionRule
      .findMany({
        where: { type: { not: "none" } },
        select: { partnerId: true, partnerUserId: true },
        distinct: ["partnerUserId"],
      })
      .catch(() => [] as { partnerId: string; partnerUserId: string }[]),
  );

  let created = 0;
  let existed = 0;
  let totalCentavos = 0;
  const failed: string[] = [];

  for (const seat of seats) {
    try {
      const r = await freezeCommission(seat.partnerId, seat.partnerUserId, month);
      if (r.created) created += 1;
      else existed += 1;
      totalCentavos += r.totalCentavos;
    } catch {
      failed.push(seat.partnerUserId);
    }
  }

  const summary = { month, seats: seats.length, created, existed, totalCentavos, failed };

  try {
    await systemDb((tx) =>
      tx.cronRun.create({
        data: {
          job: "partner-commissions",
          startedAt,
          finishedAt: new Date(),
          ok: failed.length === 0,
          detail: summary,
        },
      }),
    );
  } catch {
    /* the statements are frozen either way; the record of the run is secondary */
  }

  return Response.json(summary);
}
