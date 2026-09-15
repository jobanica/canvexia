import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * HQ's announcements to its partners.
 *
 * THE SEGMENT IS EVALUATED HERE, not in the RLS policy. A policy that parses
 * JSON to decide visibility is a policy nobody can verify by reading it. What
 * the policy DOES guarantee is that an unpublished announcement is invisible to
 * every partner — which is the part that would actually leak: a draft naming a
 * city about to lose its licence, read by that city.
 */

export interface Segment {
  tier?: string[];
  status?: string[];
  productId?: string[];
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  level: string;
  segment: Segment | null;
  scheduledFor: Date | null;
  publishedAt: Date | null;
  authorEmail: string | null;
  createdAt: Date;
  /** How many partners it targets, evaluated now. */
  audience: number;
  reads: number;
  readers: { partnerId: string; partnerName: string; readAt: Date }[];
}

/**
 * Which partners a segment covers.
 *
 * PURE and exported so the screen can preview an audience before anything is
 * published — "target a segment" with no way to see who that is means somebody
 * finds out by sending.
 *
 * An empty or absent segment means EVERY partner. An empty ARRAY for a key
 * means the same as the key being absent, deliberately: a UI with no checkboxes
 * ticked reads as "no filter on this axis", not "match nothing".
 */
export function matchesSegment(
  partner: { tier: string; status: string; enabledProducts: string[] | null },
  segment: Segment | null,
): boolean {
  if (!segment) return true;
  if (segment.tier?.length && !segment.tier.includes(partner.tier)) return false;
  if (segment.status?.length && !segment.status.includes(partner.status)) return false;
  if (segment.productId?.length) {
    // NULL enabledProducts means "every live product", which is what every
    // existing partner has. Treating it as "no products" would silently
    // exclude everybody from a product-targeted announcement.
    const theirs = partner.enabledProducts;
    if (theirs !== null && !segment.productId.some((p) => theirs.includes(p))) return false;
  }
  return true;
}

export async function listAnnouncements(): Promise<{
  rows: AnnouncementRow[];
  partnerCount: number;
}> {
  return systemDb(async (tx) => {
    const [announcements, partners, reads] = await Promise.all([
      tx.hqAnnouncement
        .findMany({ orderBy: { createdAt: "desc" }, take: 100 })
        .catch(() => []),
      tx.partner.findMany({
        select: { id: true, name: true, tier: true, status: true, enabledProducts: true },
      }),
      tx.hqAnnouncementRead
        .findMany({ select: { announcementId: true, partnerId: true, readAt: true } })
        // The catch has to name the shape, or the empty array narrows to
        // `never[]` and the grouping below cannot push into it.
        .catch(() => [] as { announcementId: string; partnerId: string; readAt: Date }[]),
    ]);

    const nameBy = new Map(partners.map((p) => [p.id, p.name]));
    const readsBy = new Map<string, { announcementId: string; partnerId: string; readAt: Date }[]>();
    for (const r of reads) {
      const list = readsBy.get(r.announcementId);
      if (list) list.push(r);
      else readsBy.set(r.announcementId, [r]);
    }

    const shaped = partners.map((p) => ({
      id: p.id,
      tier: p.tier,
      status: p.status,
      enabledProducts: Array.isArray(p.enabledProducts) ? (p.enabledProducts as string[]) : null,
    }));

    return {
      partnerCount: partners.length,
      rows: announcements.map((a) => {
        const segment = (a.segment as Segment | null) ?? null;
        const mine = readsBy.get(a.id) ?? [];
        return {
          id: a.id,
          title: a.title,
          body: a.body,
          level: a.level,
          segment,
          scheduledFor: a.scheduledFor,
          publishedAt: a.publishedAt,
          authorEmail: a.authorEmail,
          createdAt: a.createdAt,
          audience: shaped.filter((p) => matchesSegment(p, segment)).length,
          reads: mine.length,
          readers: mine.map((r) => ({
            partnerId: r.partnerId,
            partnerName: nameBy.get(r.partnerId) ?? "(unknown)",
            readAt: r.readAt,
          })),
        };
      }),
    };
  });
}

/**
 * What one partner should see in their portal.
 *
 * Published only, segment-matched, newest first. A SCHEDULED announcement whose
 * time has passed counts as published: the alternative is a cron that has to
 * run for anything to appear, and this codebase has just finished paying for a
 * cron that never ran.
 */
export async function announcementsForPartner(
  partnerId: string,
  asOf: Date = new Date(),
): Promise<{ id: string; title: string; body: string; level: string; publishedAt: Date; read: boolean }[]> {
  return systemDb(async (tx) => {
    const partner = await tx.partner.findUnique({
      where: { id: partnerId },
      select: { tier: true, status: true, enabledProducts: true },
    });
    if (!partner) return [];

    const [rows, reads] = await Promise.all([
      tx.hqAnnouncement
        .findMany({
          where: {
            OR: [
              { publishedAt: { not: null, lte: asOf } },
              { scheduledFor: { not: null, lte: asOf } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
        .catch(() => []),
      tx.hqAnnouncementRead
        .findMany({ where: { partnerId }, select: { announcementId: true } })
        .catch(() => []),
    ]);

    const readIds = new Set(reads.map((r) => r.announcementId));
    const shaped = {
      tier: partner.tier,
      status: partner.status,
      enabledProducts: Array.isArray(partner.enabledProducts)
        ? (partner.enabledProducts as string[])
        : null,
    };

    return rows
      .filter((a) => matchesSegment(shaped, (a.segment as Segment | null) ?? null))
      .map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        level: a.level,
        publishedAt: (a.publishedAt ?? a.scheduledFor)!,
        read: readIds.has(a.id),
      }));
  });
}
