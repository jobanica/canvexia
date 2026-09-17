import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * THE PARTNER'S INBOX — what their own merchants have written to them.
 *
 * REPORTED — "yes build the feedback inbox to partners." A merchant's "Send
 * feedback" button wrote to a table only Servd's super-admin could read. The
 * partner who sold them the software, who they pay every month and would ring
 * first, never learned they wrote.
 *
 * SCOPED BY THE SESSION'S PARTNER ID AND NOTHING ELSE. Every function here
 * takes the partner id as its first argument and puts it in the WHERE clause;
 * no caller may pass one that came off a request. `platform_feedback` has no
 * anon or authenticated grant — every read goes through systemDb — so this
 * clause is the whole tenant boundary and it is written the same way in all
 * three queries deliberately.
 *
 * BEST-EFFORT THROUGHOUT. The two columns ship as a hand-run migration, and a
 * database without them must show an empty inbox rather than take the portal
 * down.
 */

export interface PartnerFeedbackRow {
  id: string;
  restaurantId: string | null;
  restaurantName: string | null;
  authorEmail: string | null;
  rating: number | null;
  message: string;
  createdAt: string;
  reply: string | null;
  repliedAt: string | null;
  /** True when the partner answered; false when Servd did. */
  repliedByUs: boolean;
  /** Whether the merchant has opened the reply yet. */
  replyReadAt: string | null;
}

const FIELDS = {
  id: true,
  restaurantId: true,
  restaurantName: true,
  authorEmail: true,
  rating: true,
  message: true,
  createdAt: true,
  reply: true,
  repliedAt: true,
  replyReadAt: true,
  repliedByPartnerId: true,
} as const;

/**
 * Their merchants' messages, UNANSWERED FIRST.
 *
 * The opposite order to the merchant's own view, and for the same reason: an
 * owner opens their list looking for the answer, a partner opens theirs looking
 * for the question nobody has answered yet. Newest first within each group.
 */
export async function listPartnerFeedback(partnerId: string): Promise<PartnerFeedbackRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.platformFeedback.findMany({
        where: { partnerId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: FIELDS,
      }),
    );
    return rows
      .map((r) => ({
        id: r.id,
        restaurantId: r.restaurantId,
        restaurantName: r.restaurantName,
        authorEmail: r.authorEmail,
        rating: r.rating,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
        reply: r.reply ?? null,
        repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
        repliedByUs: r.repliedByPartnerId === partnerId,
        replyReadAt: r.replyReadAt ? r.replyReadAt.toISOString() : null,
      }))
      .sort((a, b) => Number(!!a.reply) - Number(!!b.reply));
  } catch {
    return [];
  }
}

/**
 * How many are waiting on them. Drives the badge in the nav.
 *
 * Counts UNANSWERED rather than unread, because there is no "read" for a
 * partner to record and inventing one would mean a badge that clears itself
 * when somebody glances at the page without doing anything about it.
 */
export async function unansweredFeedbackCount(partnerId: string): Promise<number> {
  try {
    return await systemDb((tx) =>
      tx.platformFeedback.count({ where: { partnerId, reply: null } }),
    );
  } catch {
    return 0;
  }
}
