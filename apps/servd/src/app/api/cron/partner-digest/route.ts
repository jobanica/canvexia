import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { runPartnerDigest, type DigestResult } from "@/server/partners/digest";

/**
 * The daily partner digest. Runs at 23:00 UTC — 07:00 Manila.
 *
 * SEVEN IN THE MORNING, LOCAL. The digest is a "here is your day" email and it
 * covers yesterday in Manila, so it has to land after that day has closed and
 * before the partner starts work. Every other cron in this project is expressed
 * in UTC for the same machine and read wrong at least once; the schedule is
 * 23:00 UTC precisely because 07:00 Manila is not expressible any other way.
 *
 * ONE TRANSACTION PER PARTNER. A single transaction across every partner means
 * one bad row leaves nobody with a digest — the same reasoning as
 * freeze-statements, and the same loop.
 *
 * Nothing here sends. `runPartnerDigest` queues into `outbound_emails`, because
 * CREDENTIALS_ENCRYPTION_KEY is unset on this project and no code path in this
 * repository can put mail on the wire. The run is recorded either way, which is
 * the part that was missing: a digest that never fires and a digest with nothing
 * to say produced exactly the same evidence before this table was written to.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const asOf = new Date();
  const startedAt = new Date();

  const partners = await systemDb((tx) =>
    tx.partner.findMany({
      where: { status: "approved" },
      select: { id: true, name: true },
    }),
  );

  const results: DigestResult[] = [];
  for (const p of partners) {
    try {
      results.push(await runPartnerDigest(p, asOf));
    } catch (e) {
      results.push({
        partnerId: p.id,
        worthSending: false,
        queued: 0,
        error: e instanceof Error ? e.message : "failed",
      });
    }
  }

  const failed = results.filter((r) => r.error).map((r) => r.partnerId);
  const summary = {
    partners: partners.length,
    // Composed something worth saying.
    composed: results.filter((r) => r.worthSending).length,
    // Rows written. Lower than `composed` when a partner has no active seat, or
    // when every seat has turned the digest off.
    queued: results.reduce((s, r) => s + r.queued, 0),
    failed,
  };

  try {
    await systemDb((tx) =>
      tx.cronRun.create({
        data: {
          job: "partner-digest",
          startedAt,
          finishedAt: new Date(),
          ok: failed.length === 0,
          detail: summary,
        },
      }),
    );
  } catch {
    /* the digests are queued either way; the record of the run is secondary */
  }

  return Response.json(summary);
}
