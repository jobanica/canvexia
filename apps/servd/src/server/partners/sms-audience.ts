import "server-only";
import { partnerDb } from "@/server/tenancy/scoped-db";

/**
 * Who a campaign goes to.
 *
 * WHAT THIS CAN AND CANNOT FILTER ON, stated plainly rather than faked. The
 * brief lists prospect stage, tags, merchant product/plan/status, source, last
 * visit date, assigned staff and city/area. The contact book and the prospects
 * table between them can answer: tags, source, prospect stage, assigned staff,
 * product, and how long since we last texted them.
 *
 * `plan` and `status` live inside each product's own merchant table — ids are
 * unique only within a product (D29) — so filtering on them means a per-product
 * lookup, and `city/area` has no column on either table. Both are left OUT
 * rather than approximated: a filter that silently means something else is
 * worse than a filter that is not offered, because somebody will build an
 * audience on it and believe the count.
 */

export interface AudienceFilters {
  tags?: string[];
  /** visit | lead_form | merchant_owner | import | manual */
  sources?: string[];
  /** Prospect stages, for contacts linked to a prospect. */
  stages?: string[];
  /** Seat id — contacts whose prospect is assigned to this person. */
  assignedToId?: string;
  productId?: string;
  /** Exclude anybody texted in the last N days. Separate from the hard cap. */
  quietDays?: number;
}

export interface AudienceMember {
  id: string;
  mobile: string;
  name: string | null;
  businessName: string | null;
  lastSentAt: Date | null;
}

/**
 * Resolve an audience.
 *
 * `consentStatus: "opted_in"` IS NOT A FILTER AND CANNOT BE TURNED OFF. It is
 * written into the where clause below every time, because the one thing a
 * segment builder must never be able to express is "everybody, including the
 * people who said no".
 */
export async function resolveAudience(
  partnerId: string,
  filters: AudienceFilters,
): Promise<AudienceMember[]> {
  const quietSince =
    filters.quietDays && filters.quietDays > 0
      ? new Date(Date.now() - filters.quietDays * 86_400_000)
      : null;

  try {
    const contacts = await partnerDb(partnerId, (tx) =>
      tx.smsContact.findMany({
        where: {
          // Not negotiable. See above.
          consentStatus: "opted_in",
          ...(filters.tags?.length ? { tags: { hasSome: filters.tags } } : {}),
          ...(filters.sources?.length ? { source: { in: filters.sources } } : {}),
          ...(filters.productId ? { productId: filters.productId } : {}),
          ...(quietSince
            ? { OR: [{ lastSentAt: null }, { lastSentAt: { lt: quietSince } }] }
            : {}),
        },
        select: {
          id: true,
          mobile: true,
          name: true,
          businessName: true,
          lastSentAt: true,
          prospectId: true,
        },
        take: 5000,
      }),
    );

    const needsProspect = !!(filters.stages?.length || filters.assignedToId);
    if (!needsProspect) return contacts.map(strip);

    // The prospect half, as ONE query rather than one per contact. A partner
    // has thousands of contacts and a loop here is a loop of transactions —
    // the mistake that cost the portal six of its seven seconds once already.
    const prospectIds = contacts
      .map((c) => c.prospectId)
      .filter((id): id is string => !!id);
    if (prospectIds.length === 0) return [];

    const prospects = await partnerDb(partnerId, (tx) =>
      tx.prospect.findMany({
        where: {
          id: { in: prospectIds },
          ...(filters.stages?.length ? { stage: { in: filters.stages as never[] } } : {}),
          ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
        },
        select: { id: true },
      }),
    );
    const keep = new Set(prospects.map((p) => p.id));
    return contacts.filter((c) => c.prospectId && keep.has(c.prospectId)).map(strip);
  } catch {
    // An audience that cannot be resolved is EMPTY, which sends nothing. The
    // other way round sends a campaign to a list nobody chose.
    return [];
  }
}

function strip(c: {
  id: string;
  mobile: string;
  name: string | null;
  businessName: string | null;
  lastSentAt: Date | null;
}): AudienceMember {
  return {
    id: c.id,
    mobile: c.mobile,
    name: c.name,
    businessName: c.businessName,
    lastSentAt: c.lastSentAt,
  };
}

/** Saved segments, for the composer's dropdown. */
export async function listSegments(partnerId: string) {
  try {
    return await partnerDb(partnerId, (tx) =>
      tx.smsSegment.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, filters: true },
      }),
    );
  } catch {
    return [];
  }
}

/** Every tag in use, so the composer can offer them rather than ask people to type. */
export async function knownTags(partnerId: string): Promise<string[]> {
  try {
    const rows = await partnerDb(partnerId, (tx) =>
      tx.smsContact.findMany({ select: { tags: true }, take: 2000 }),
    );
    return [...new Set(rows.flatMap((r) => r.tags))].sort();
  } catch {
    return [];
  }
}
