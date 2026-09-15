import { NextRequest } from "next/server";
import { freezeStatement, monthKeyOf, previousMonth } from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Close last month for every partner. Runs on the 1st, Manila time.
 *
 * IDEMPOTENT. `freezeStatement` is a no-op when the row exists, so a cron that
 * fires twice — or a manual re-run after a failure — cannot double anything or
 * reset a payout status HQ has since marked paid.
 *
 * THE MONTH IS COMPUTED FROM THE KEY, not from "now minus a day". Vercel Cron
 * is UTC-only and Manila is UTC+8, so "yesterday" lands in a different month
 * depending on which side of 16:00 UTC the job fires — the first cut of this
 * ran at 16:00 UTC on the 1st, which is the 2nd in Manila, and would have
 * frozen the month that had just STARTED. The schedule is now 01:00 UTC on the
 * 1st (09:00 Manila, unambiguously the 1st there) and the month is the previous
 * one by arithmetic on the key, which has no time zone in it.
 *
 * systemDb, because it writes across every partner at once. The statement's
 * CONTENT is still per-partner and derived from that partner's own ledger rows.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const month = previousMonth(monthKeyOf(new Date()));

  const partners = await systemDb((tx) =>
    tx.partner.findMany({
      where: { status: "approved", tier: "operator" },
      select: { id: true },
    }),
  );

  let created = 0;
  let existed = 0;
  const failed: string[] = [];

  for (const p of partners) {
    try {
      // One transaction per partner. A single transaction over every partner
      // means one bad row leaves nobody with a statement.
      const r = await systemDb((tx) => freezeStatement(tx, p.id, month));
      if (r.created) created += 1;
      else existed += 1;
    } catch {
      failed.push(p.id);
    }
  }

  return Response.json({ month, partners: partners.length, created, existed, failed });
}
