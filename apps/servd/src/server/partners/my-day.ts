import "server-only";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";
import { manilaDayKey } from "@/server/partners/attendance";
import { monthKeyOf } from "@servd/db";
import { listPartnerMerchants, type PartnerMerchant } from "./merchants";

/**
 * "My day" — the overview a `sales` or `support` seat gets instead of the
 * partner-wide one.
 *
 * A salesperson opening the portal and seeing the whole operator's MRR is the
 * thing A7 exists to stop. What they see instead is their own work: are they
 * checked in, who is due a call today, what is in their pipeline, which
 * merchants are theirs, and how they are tracking against their target.
 *
 * ONE SCOPE, everything in parallel. Same reasoning as `getPartnerOverview`:
 * each scope wrapper is a transaction and a transaction is four round trips, so
 * the reads that belong to one screen share one.
 */
export interface MyDay {
  /** Null when the seat has not checked in today. */
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  /** Prospects assigned to me whose follow-up is due or overdue. */
  followUps: { id: string; businessName: string; nextFollowUpAt: Date | null }[];
  /** My pipeline, counted by stage. */
  byStage: { stage: string; count: number }[];
  /** Merchants assigned to me, across both products. */
  merchants: PartnerMerchant[];
  /** This month's target and what is against it. Null when none is set. */
  target: {
    month: string;
    targetMerchants: number;
    targetVisits: number;
    targetDemos: number;
    visits: number;
    demos: number;
    conversions: number;
  } | null;
  /**
   * This month's commission, in centavos, or null when the seat has no
   * statement yet.
   *
   * A statement exists only after the monthly job runs, so for most of any
   * given month this is null and the screen says "next statement on the 1st"
   * rather than showing ₱0, which would read as "you have earned nothing".
   */
  commissionCentavos: number | null;
  /** The month the commission figure is for. */
  commissionMonth: string;
}

export async function getMyDay(
  partnerId: string,
  partnerUserId: string,
  asOf: Date = new Date(),
): Promise<MyDay> {
  // `manilaDayKey`, not `startOfManilaDay(...).toISOString().slice(0,10)`:
  // that returns the UTC instant of Manila midnight, which is 16:00 on the
  // PREVIOUS UTC date, so slicing it gives yesterday's key for most of the
  // working day — and the check-in card would say "not in" to somebody who is.
  const dayKey = manilaDayKey(asOf);
  const month = monthKeyOf(asOf);
  const monthStart = new Date(`${month}-01T00:00:00Z`);

  const [merchants, scoped] = await Promise.all([
    myMerchants(partnerId, partnerUserId),
    // The seat GUC is passed so the staff tables are readable at all: without
    // it they read as empty, which is the safe default and the wrong answer
    // here.
    partnerDb(
      partnerId,
      async (tx) =>
        Promise.all([
          tx.attendanceSession
            .findFirst({
              where: { partnerUserId, dayKey },
              select: { checkInAt: true, checkOutAt: true },
            })
            .catch(() => null),
          tx.prospect
            .findMany({
              where: {
                assignedToId: partnerUserId,
                stage: { notIn: ["paid", "lost"] },
                nextFollowUpAt: { not: null, lte: asOf },
              },
              select: { id: true, businessName: true, nextFollowUpAt: true },
              orderBy: { nextFollowUpAt: "asc" },
              take: 20,
            })
            .catch(() => []),
          tx.prospect
            .groupBy({
              by: ["stage"],
              where: { assignedToId: partnerUserId },
              _count: { _all: true },
            })
            .catch(() => [] as { stage: string; _count: { _all: number } }[]),
          tx.staffTarget
            .findFirst({
              where: { partnerUserId, month },
              select: {
                targetMerchants: true,
                targetVisits: true,
                targetDemos: true,
              },
            })
            .catch(() => null),
          tx.staffEvent
            .groupBy({
              by: ["kind"],
              where: { partnerUserId, occurredAt: { gte: monthStart } },
              _count: { _all: true },
            })
            .catch(() => [] as { kind: string; _count: { _all: number } }[]),
          tx.commissionStatement
            .findFirst({
              where: { partnerUserId, month },
              select: { totalCentavos: true },
            })
            .catch(() => null),
        ]),
      partnerUserId,
    ),
  ]);

  const [session, followUps, stages, target, events, statement] = scoped;
  const count = (kind: string) =>
    events.find((e: { kind: string }) => e.kind === kind)?._count._all ?? 0;

  return {
    checkedInAt: session?.checkInAt ?? null,
    checkedOutAt: session?.checkOutAt ?? null,
    followUps,
    byStage: stages.map((s: { stage: string; _count: { _all: number } }) => ({
      stage: String(s.stage),
      count: s._count._all,
    })),
    merchants,
    target: target
      ? {
          month,
          ...target,
          visits: count("visit.logged"),
          demos: count("demo.built"),
          conversions: count("merchant.converted"),
        }
      : null,
    commissionCentavos: statement?.totalCentavos ?? null,
    commissionMonth: month,
  };
}

/**
 * The merchants assigned to one seat, across both products.
 *
 * Filters the partner's whole list rather than querying by
 * `assignedSalesUserId` twice, because `listPartnerMerchants` is the one place
 * that knows how to read two merchant tables onto one shape (D29) and a second
 * copy of that is a second place to get a product wrong. The list is a partner's
 * merchants, not a country's, so filtering in memory is cheap.
 */
export async function myMerchants(
  partnerId: string,
  partnerUserId: string,
): Promise<PartnerMerchant[]> {
  const [all, assignments] = await Promise.all([
    listPartnerMerchants(partnerId),
    assignedKeys(partnerId, partnerUserId),
  ]);
  return all.filter((m) => assignments.has(`${m.productId}:${m.id}`));
}

/** `productId:id` for every merchant assigned to this seat, either way. */
async function assignedKeys(
  partnerId: string,
  partnerUserId: string,
): Promise<Set<string>> {
  try {
    const [restaurants, pharmacies] = await systemDb((tx) =>
      Promise.all([
        tx.restaurant.findMany({
          where: {
            partnerId,
            OR: [
              { assignedSalesUserId: partnerUserId },
              { assignedSupportUserId: partnerUserId },
            ],
          },
          select: { id: true },
        }),
        tx.pharmacy.findMany({
          where: {
            partnerId,
            OR: [
              { assignedSalesUserId: partnerUserId },
              { assignedSupportUserId: partnerUserId },
            ],
          },
          select: { id: true },
        }),
      ]),
    );
    return new Set([
      ...restaurants.map((r) => `servd:${r.id}`),
      ...pharmacies.map((p) => `pharmacy:${p.id}`),
    ]);
  } catch {
    // The assignment columns are not migrated yet. An empty set means "nothing
    // assigned", which is true of every merchant that existed before A7.
    return new Set();
  }
}
