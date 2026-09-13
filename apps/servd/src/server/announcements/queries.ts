import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * What the platform owner has told every restaurant.
 *
 * Every read here is best-effort and returns "nothing" on failure. The tables
 * arrive in a manual migration, and an announcement banner is the last thing
 * that should be able to take a dashboard down — a shop can trade all day
 * without ever seeing one.
 */

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  level: string; // info | warning | incident
  publishedAt: string | null;
  createdAt: string;
  /** This reader hasn't opened it yet. */
  unread: boolean;
}

/** How many published announcements this person hasn't read. Never throws. */
export async function unreadCount(staffUserId: string): Promise<number> {
  try {
    return await systemDb((tx) =>
      tx.announcement.count({
        where: {
          publishedAt: { not: null },
          reads: { none: { staffUserId } },
        },
      }),
    );
  } catch {
    return 0; // table not migrated yet — no badge, no error
  }
}

/** Published announcements, newest first, flagged read/unread for this person. */
export async function listAnnouncements(staffUserId: string): Promise<AnnouncementRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.announcement.findMany({
        where: { publishedAt: { not: null } },
        orderBy: { publishedAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          body: true,
          level: true,
          publishedAt: true,
          createdAt: true,
          reads: { where: { staffUserId }, select: { id: true }, take: 1 },
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      level: r.level,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      unread: r.reads.length === 0,
    }));
  } catch {
    return [];
  }
}

/** Everything, drafts included — the super-admin's own list. */
export async function listAllAnnouncements(): Promise<
  (Omit<AnnouncementRow, "unread"> & { readCount: number })[]
> {
  try {
    const rows = await systemDb((tx) =>
      tx.announcement.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          title: true,
          body: true,
          level: true,
          publishedAt: true,
          createdAt: true,
          _count: { select: { reads: true } },
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      level: r.level,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      readCount: r._count.reads,
    }));
  } catch {
    return [];
  }
}
