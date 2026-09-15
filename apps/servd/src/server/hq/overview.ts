import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import {
  buildHealthBoard,
  buildHqAttention,
  type DemandFact,
  type HealthRow,
  type HqAttentionItem,
  type PartnerFact,
} from "@/lib/hq/health";

/**
 * Everything the HQ Overview shows, in one read.
 *
 * `systemDb` ON PURPOSE, and this file says why rather than leaving it to be
 * inferred: /hq is the one place in this system that legitimately reads across
 * partners. Every other context must not, which is what makes a `systemDb` call
 * anywhere else worth a second look.
 *
 * THE MONEY HERE IS A LIVE VIEW, not a statement. It multiplies today's plan
 * prices by today's active merchants; a statement is computed from the ledger,
 * where each row carries the share that applied when the payment settled. The
 * two will disagree mid-month and that is correct — the screen says which is
 * which, because an HQ figure read as "what we will be paid" and then differing
 * has misled somebody.
 */

export interface HqOverview {
  partners: { active: number; onboarding: number; suspended: number };
  merchants: { total: number; paying: number };
  grossMrrCentavos: number;
  hqMrrCentavos: number;
  /** Month on month, or null where there is nothing to compare against. */
  mom: {
    merchants: number | null;
    grossMrr: number | null;
    hqMrr: number | null;
    partners: number | null;
  };
  board: HealthRow[];
  attention: HqAttentionItem[];
  /** Last 12 months, oldest first. */
  series: { month: string; merchants: number; grossCentavos: number; hqCentavos: number }[];
  overdueDays: number;
}

const MONTHS = 12;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Merchants and MRR by month, last twelve.
 *
 * A GROWTH curve, not a revenue history, and labelled as such on the screen.
 * It is built from each merchant's `createdAt` and today's price, so a merchant
 * who upgraded last week appears at the new price in every past month.
 * Reconstructing the real history needs the ledger — which has zero rows today
 * — and that is H6's job. The partner portal's chart carries the same caveat
 * for the same reason.
 */
function buildSeries(
  merchants: readonly { createdAt: Date; priceMonthly: number; sharePct: number }[],
  asOf: Date,
) {
  const out: HqOverview["series"] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i + 1, 1));
    const upTo = merchants.filter((m) => m.createdAt < end);
    const gross = upTo.reduce((s, m) => s + m.priceMonthly, 0);
    const hq = upTo.reduce(
      (s, m) => s + (m.priceMonthly - Math.floor((m.priceMonthly * m.sharePct) / 100)),
      0,
    );
    out.push({
      month: monthKey(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i, 1))),
      merchants: upTo.length,
      grossCentavos: gross,
      hqCentavos: hq,
    });
  }
  return out;
}

function momPct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export async function getHqOverview(asOf: Date = new Date()): Promise<HqOverview> {
  return systemDb(async (tx) => {
    // One scope, everything issued together. Each scope wrapper is a
    // transaction — BEGIN, the SET, the query, COMMIT — so awaiting six of them
    // in series is six times the round trips for reads that do not depend on
    // each other.
    const [partners, restaurants, pharmacies, statements, waitlist, territories, program] =
      await Promise.all([
        tx.partner.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            tier: true,
            territory: true,
            isHouse: true,
            revenueSharePct: true,
            collectionMode: true,
            licenseStartedAt: true,
            exclusivityExpiresAt: true,
            milestones: true,
            createdAt: true,
          },
        }),
        tx.restaurant.findMany({
          where: { partnerId: { not: null } },
          select: {
            partnerId: true,
            createdAt: true,
            subscriptions: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { status: true, plan: { select: { priceMonthly: true } } },
            },
          },
        }),
        // Resceta merchants are their own table (D29) and have no billing yet,
        // so they count toward merchant totals and contribute nothing to MRR.
        // Counting them at ₱0 would be a number; this is a gap.
        tx.pharmacy.findMany({
          where: { partnerId: { not: null } },
          select: { partnerId: true, createdAt: true },
        }),
        tx.partnerStatement
          .findMany({
            orderBy: { month: "desc" },
            select: {
              partnerId: true,
              month: true,
              payoutStatus: true,
              frozenAt: true,
              partnerCentavos: true,
            },
          })
          .catch(() => []),
        tx.partnerWaitlist
          .findMany({ select: { city: true } })
          .catch(() => [] as { city: string }[]),
        tx.territory
          .findMany({ select: { name: true, partnerId: true } })
          .catch(() => [] as { name: string; partnerId: string | null }[]),
        tx.programSetting
          .findUnique({ where: { id: "program" }, select: { overdueDays: true } })
          .catch(() => null),
      ]);

    const overdueDays = program?.overdueDays ?? 15;
    const shareBy = new Map(partners.map((p) => [p.id, p.revenueSharePct]));

    // Only the NEWEST statement per partner matters to the board; the list is
    // already sorted by month descending, so the first one wins.
    const latestBy = new Map<string, (typeof statements)[number]>();
    for (const s of statements) if (!latestBy.has(s.partnerId)) latestBy.set(s.partnerId, s);

    type Counted = { createdAt: Date; priceMonthly: number; sharePct: number; paying: boolean };
    const byPartner = new Map<string, Counted[]>();
    const push = (partnerId: string, row: Counted) => {
      const list = byPartner.get(partnerId);
      if (list) list.push(row);
      else byPartner.set(partnerId, [row]);
    };

    for (const r of restaurants) {
      const sub = r.subscriptions[0];
      // "Paying" is active WITH a price. A trial is not revenue, and counting it
      // as such is the generous direction — which tells HQ it has hit a number
      // it has not.
      const paying = sub?.status === "active" && (sub.plan?.priceMonthly ?? 0) > 0;
      push(r.partnerId!, {
        createdAt: r.createdAt,
        priceMonthly: paying ? (sub!.plan?.priceMonthly ?? 0) : 0,
        sharePct: shareBy.get(r.partnerId!) ?? 0,
        paying,
      });
    }
    for (const p of pharmacies) {
      push(p.partnerId!, {
        createdAt: p.createdAt,
        priceMonthly: 0,
        sharePct: shareBy.get(p.partnerId!) ?? 0,
        paying: false,
      });
    }

    const facts: PartnerFact[] = partners.map((p) => {
      const mine = byPartner.get(p.id) ?? [];
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        status: p.status,
        tier: p.tier,
        territory: p.territory,
        isHouse: p.isHouse,
        revenueSharePct: p.revenueSharePct,
        collectionMode: p.collectionMode,
        licenseStartedAt: p.licenseStartedAt,
        exclusivityExpiresAt: p.exclusivityExpiresAt,
        milestones: p.milestones,
        merchants: mine.length,
        paying: mine.filter((m) => m.paying).length,
        mrrCentavos: mine.reduce((s, m) => s + m.priceMonthly, 0),
        latestStatement: latestBy.get(p.id) ?? null,
      };
    });

    const board = buildHealthBoard(facts, { overdueDays, asOf });

    // Demand: a city with applicants and nobody serving it. `partner_waitlist`
    // stores the city as FREE TEXT — a city not in `territories` is a real
    // signal, which is why it is not a foreign key — so this matches on the
    // name and treats an unmatched city as untaken, which it is.
    const takenNames = new Set(
      territories.filter((t) => t.partnerId).map((t) => t.name.trim().toLowerCase()),
    );
    const counted = new Map<string, number>();
    for (const w of waitlist) {
      const key = w.city.trim();
      if (key) counted.set(key, (counted.get(key) ?? 0) + 1);
    }
    const demand: DemandFact[] = [...counted].map(([city, applicants]) => ({
      city,
      applicants,
      taken: takenNames.has(city.toLowerCase()),
    }));

    const all = [...byPartner.values()].flat();
    const series = buildSeries(all, asOf);
    const thisMonth = series[series.length - 1];
    const lastMonth = series[series.length - 2];

    const grossMrr = facts.reduce((s, f) => s + f.mrrCentavos, 0);
    const hqMrr = board.reduce((s, r) => s + r.hqShareCentavos, 0);

    const startOfMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
    const partnersBefore = partners.filter((p) => p.createdAt < startOfMonth).length;

    return {
      partners: {
        active: partners.filter((p) => p.status === "approved").length,
        onboarding: partners.filter((p) => p.status === "pending").length,
        suspended: partners.filter((p) => p.status === "suspended").length,
      },
      merchants: { total: all.length, paying: all.filter((m) => m.paying).length },
      grossMrrCentavos: grossMrr,
      hqMrrCentavos: hqMrr,
      mom: {
        merchants: lastMonth ? momPct(thisMonth.merchants, lastMonth.merchants) : null,
        grossMrr: lastMonth ? momPct(thisMonth.grossCentavos, lastMonth.grossCentavos) : null,
        hqMrr: lastMonth ? momPct(thisMonth.hqCentavos, lastMonth.hqCentavos) : null,
        partners: momPct(partners.length, partnersBefore),
      },
      board,
      attention: buildHqAttention(board, demand),
      series,
      overdueDays,
    };
  });
}
