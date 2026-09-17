import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

export interface PlatformFeedbackRow {
  id: string;
  restaurantName: string | null;
  authorEmail: string | null;
  rating: number | null;
  message: string;
  resolved: boolean;
  createdAt: string;
  /** What the Servd team wrote back, if anything. */
  reply: string | null;
  repliedAt: string | null;
  /** Set once the owner has seen the reply — drives the unread dot. */
  replyReadAt: string | null;
  /**
   * WHOSE MERCHANT THIS IS, and who answered.
   *
   * A partner-sold shop's message is addressed to their partner, who has their
   * own inbox at /partner/feedback. Servd still sees every row — one table, one
   * platform operator — but must be able to tell at a glance that somebody else
   * is already on it, or two companies answer the same question differently.
   *
   * Both null is the original case: Servd sold them directly and Servd answers.
   */
  partnerName: string | null;
  answeredByPartner: boolean;
}

/**
 * Explicit columns, no SELECT *.
 *
 * This used to be a bare findMany, which returns every column the Prisma model
 * declares — so adding one that a database hadn't migrated yet would take the
 * whole feedback page down. Naming them means a new column can only break the
 * queries that actually asked for it.
 */
const FIELDS = {
  id: true,
  restaurantName: true,
  authorEmail: true,
  rating: true,
  message: true,
  resolved: true,
  createdAt: true,
} as const;

/**
 * Layered on separately, like the reply columns and for the same reason: they
 * ship as a hand-run migration, and a database without them must still show the
 * feedback it has.
 */
async function withOwners(rows: PlatformFeedbackRow[]): Promise<PlatformFeedbackRow[]> {
  if (rows.length === 0) return rows;
  try {
    const extra = await systemDb((tx) =>
      tx.platformFeedback.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: { id: true, partnerId: true, repliedByPartnerId: true },
      }),
    );
    const ids = [...new Set(extra.map((e) => e.partnerId).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const partners = await systemDb((tx) =>
        tx.partner.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      );
      for (const p of partners) names.set(p.id, p.name);
    }
    const byId = new Map(extra.map((e) => [e.id, e]));
    for (const row of rows) {
      const e = byId.get(row.id);
      if (!e) continue;
      row.partnerName = e.partnerId ? (names.get(e.partnerId) ?? "a partner") : null;
      row.answeredByPartner = !!e.repliedByPartnerId;
    }
  } catch {
    /* columns not migrated — every row reads as Servd's own, which it was */
  }
  return rows;
}

type Base = {
  id: string;
  restaurantName: string | null;
  authorEmail: string | null;
  rating: number | null;
  message: string;
  resolved: boolean;
  createdAt: Date;
};

function shape(r: Base): PlatformFeedbackRow {
  return {
    id: r.id,
    restaurantName: r.restaurantName,
    authorEmail: r.authorEmail,
    rating: r.rating,
    message: r.message,
    resolved: r.resolved,
    createdAt: r.createdAt.toISOString(),
    reply: null,
    repliedAt: null,
    replyReadAt: null,
    partnerName: null,
    answeredByPartner: false,
  };
}

/**
 * Layer the reply columns on, best-effort.
 *
 * Their own query and their own catch: they ship as a hand-run migration, and
 * a database without them must still show the feedback it does have rather
 * than an empty page.
 */
async function withReplies(rows: PlatformFeedbackRow[]): Promise<PlatformFeedbackRow[]> {
  if (rows.length === 0) return rows;
  try {
    const extra = await systemDb((tx) =>
      tx.platformFeedback.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        select: { id: true, reply: true, repliedAt: true, replyReadAt: true },
      }),
    );
    const byId = new Map(extra.map((e) => [e.id, e]));
    for (const row of rows) {
      const e = byId.get(row.id);
      if (!e) continue;
      row.reply = e.reply ?? null;
      row.repliedAt = e.repliedAt ? e.repliedAt.toISOString() : null;
      row.replyReadAt = e.replyReadAt ? e.replyReadAt.toISOString() : null;
    }
  } catch {
    /* reply columns not migrated yet — nothing has been answered, which reads right */
  }
  return rows;
}

/** All SaaS feedback from restaurants, newest first (super-admin). */
export async function listPlatformFeedback(): Promise<PlatformFeedbackRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.platformFeedback.findMany({ orderBy: { createdAt: "desc" }, take: 300, select: FIELDS }),
    );
    return withOwners(await withReplies(rows.map(shape)));
  } catch {
    return [];
  }
}

/**
 * One restaurant's own feedback, so the owner can read what we wrote back.
 *
 * Answered messages first — an owner opening this is looking for the reply,
 * not re-reading what they sent.
 */
export async function listMyFeedback(restaurantId: string): Promise<PlatformFeedbackRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.platformFeedback.findMany({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: FIELDS,
      }),
    );
    const withR = await withReplies(rows.map(shape));
    return [...withR].sort((a, b) => Number(!!b.reply) - Number(!!a.reply));
  } catch {
    return [];
  }
}

/** How many replies this restaurant hasn't opened yet. Never throws. */
export async function unreadReplyCount(restaurantId: string): Promise<number> {
  try {
    return await systemDb((tx) =>
      tx.platformFeedback.count({
        where: { restaurantId, reply: { not: null }, replyReadAt: null },
      }),
    );
  } catch {
    return 0; // not migrated — no replies exist to be unread
  }
}
