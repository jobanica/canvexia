import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { VISIT_RADIUS_METERS, isUsable, type Point, type VisitFlag } from "@/lib/partners/geo";

/**
 * Field attendance and visits: the reads.
 *
 * `manilaDayKey` is the unit everything here is counted in. Vercel Cron is UTC
 * and Manila is UTC+8, so "today" derived from an instant is the wrong day for
 * eight hours out of every twenty-four — the same trap that once put the
 * statement freeze a month out of place.
 */
export function manilaDayKey(at: Date = new Date()): string {
  // SHIFT, then slice. `startOfManilaDay()` returns the UTC INSTANT of Manila
  // midnight, which is 16:00 on the previous UTC date — so slicing its ISO
  // string gives yesterday's key for most of the working day. Adding the offset
  // first puts the wall-clock date into the UTC fields, which is what
  // toISOString() reads.
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Manila midnight-to-midnight, as the pair of UTC instants bounding it. */
export function manilaDayRange(dayKey: string): { from: Date; to: Date } {
  const from = new Date(`${dayKey}T00:00:00+08:00`);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

export interface SessionRow {
  id: string;
  partnerUserId: string;
  dayKey: string;
  checkInAt: Date;
  checkOutAt: Date | null;
  checkInLat: number | null;
  checkInLng: number | null;
  autoClosed: boolean;
  method: string;
}

/** This seat's session for one Manila day, or null if they have not checked in. */
export async function todaySession(
  partnerId: string,
  partnerUserId: string,
  dayKey = manilaDayKey(),
): Promise<SessionRow | null> {
  try {
    return await systemDb((tx) =>
      tx.attendanceSession.findFirst({
        where: { partnerId, partnerUserId, dayKey },
        select: {
          id: true,
          partnerUserId: true,
          dayKey: true,
          checkInAt: true,
          checkOutAt: true,
          checkInLat: true,
          checkInLng: true,
          autoClosed: true,
          method: true,
        },
      }),
    );
  } catch {
    return null;
  }
}

export interface VisitRow {
  id: string;
  partnerUserId: string;
  subjectType: string;
  subjectId: string;
  subjectName: string | null;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  outcome: string;
  notes: string | null;
  occurredAt: Date;
  /** Storage path, never a URL. Signed per viewer — see signFieldPhoto. */
  photoPath: string | null;
  /** Recomputed for display; the stored distance is what was true at the time. */
  flag: VisitFlag;
}

export async function visitsForDay(
  partnerId: string,
  dayKey: string,
  opts: { partnerUserId?: string } = {},
): Promise<VisitRow[]> {
  const { from, to } = manilaDayRange(dayKey);
  try {
    const rows = await systemDb((tx) =>
      tx.staffVisit.findMany({
        where: {
          partnerId,
          ...(opts.partnerUserId ? { partnerUserId: opts.partnerUserId } : {}),
          occurredAt: { gte: from, lt: to },
        },
        orderBy: { occurredAt: "desc" },
        select: {
          id: true,
          partnerUserId: true,
          subjectType: true,
          subjectId: true,
          subjectName: true,
          lat: true,
          lng: true,
          accuracy: true,
          distanceMeters: true,
          outcome: true,
          notes: true,
          occurredAt: true,
          photoPath: true,
        },
      }),
    );
    return rows.map(({ accuracy, ...r }) => ({
      ...r,
      // The FLAG is derived, the DISTANCE is stored. A distance recomputed
      // later would move when a merchant's address is corrected, quietly
      // rewriting what a visit looked like on the day it happened.
      flag: flagOf(r.distanceMeters, r.lat, r.lng, accuracy),
    }));
  } catch {
    return [];
  }
}

/**
 * The flag for a STORED visit.
 *
 * Deliberately not `checkVisit()`: that function takes two points and computes
 * the distance, and here the distance was computed when the visit was logged
 * and written down. Recomputing it would move the answer when a merchant's
 * address is corrected months later, quietly rewriting what the visit looked
 * like on the day.
 *
 * So this reads the stored number and applies the same threshold and the same
 * accuracy allowance, which `VISIT_RADIUS_METERS` keeps in one place.
 */
function flagOf(
  distance: number | null,
  lat: number | null,
  lng: number | null,
  accuracy: number | null,
): VisitFlag {
  if (lat === null || lng === null) return "no_location";
  if (distance === null) return "no_address";
  return distance <= VISIT_RADIUS_METERS + Math.max(0, accuracy ?? 0) ? "ok" : "far";
}

/**
 * The manager's week: one row per staff member per day.
 *
 * Built in memory from two flat reads rather than a query per person. A partner
 * has tens of staff, not thousands, and a loop of queries here is a loop of
 * transactions — the mistake that cost the portal six of its seven seconds.
 */
export interface AttendanceDay {
  dayKey: string;
  firstIn: Date | null;
  lastOut: Date | null;
  autoClosed: boolean;
  visits: number;
  /** "gps" | "qr" | null when there was no check-in. How it was proved. */
  method: string | null;
  /** No check-in at all, on a day when they logged visits — or the reverse. */
  flags: ("no_check_in" | "no_visits" | "never_checked_out" | "gps_mismatch")[];
}

export interface StaffWeek {
  partnerUserId: string;
  name: string;
  days: AttendanceDay[];
  totalVisits: number;
  daysPresent: number;
}

export async function attendanceWeek(
  partnerId: string,
  dayKeys: string[],
): Promise<StaffWeek[]> {
  if (dayKeys.length === 0) return [];
  const from = manilaDayRange(dayKeys[0]).from;
  const to = manilaDayRange(dayKeys[dayKeys.length - 1]).to;

  const [seats, sessions, visits] = await systemDb(async (tx) => [
    await tx.partnerUser.findMany({
      where: { partnerId, status: "active" },
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    }),
    await tx.attendanceSession
      .findMany({
        where: { partnerId, dayKey: { in: dayKeys } },
        select: {
          partnerUserId: true,
          dayKey: true,
          checkInAt: true,
          checkOutAt: true,
          autoClosed: true,
          method: true,
        },
      })
      .catch(() => []),
    await tx.staffVisit
      .findMany({
        where: { partnerId, occurredAt: { gte: from, lt: to } },
        select: {
          partnerUserId: true,
          occurredAt: true,
          distanceMeters: true,
          accuracy: true,
          lat: true,
        },
      })
      .catch(() => []),
  ]);

  const sessionBy = new Map<string, (typeof sessions)[number]>();
  for (const s of sessions) sessionBy.set(`${s.partnerUserId}:${s.dayKey}`, s);

  const visitsBy = new Map<string, { far: number; total: number }>();
  for (const v of visits) {
    const key = `${v.partnerUserId}:${manilaDayKey(v.occurredAt)}`;
    const cur = visitsBy.get(key) ?? { far: 0, total: 0 };
    cur.total += 1;
    if (
      v.lat !== null &&
      v.distanceMeters !== null &&
      v.distanceMeters > VISIT_RADIUS_METERS + Math.max(0, v.accuracy ?? 0)
    ) {
      cur.far += 1;
    }
    visitsBy.set(key, cur);
  }

  return seats.map((seat) => {
    const days: AttendanceDay[] = dayKeys.map((dayKey) => {
      const s = sessionBy.get(`${seat.id}:${dayKey}`);
      const v = visitsBy.get(`${seat.id}:${dayKey}`) ?? { far: 0, total: 0 };
      const flags: AttendanceDay["flags"] = [];
      if (!s && v.total > 0) flags.push("no_check_in");
      if (s && v.total === 0) flags.push("no_visits");
      if (s?.autoClosed) flags.push("never_checked_out");
      if (v.far > 0) flags.push("gps_mismatch");
      return {
        dayKey,
        firstIn: s?.checkInAt ?? null,
        lastOut: s?.checkOutAt ?? null,
        autoClosed: s?.autoClosed ?? false,
        visits: v.total,
        method: s?.method ?? null,
        flags,
      };
    });
    return {
      partnerUserId: seat.id,
      name: seat.name ?? seat.email,
      days,
      totalVisits: days.reduce((n, d) => n + d.visits, 0),
      daysPresent: days.filter((d) => d.firstIn).length,
    };
  });
}

/** The last seven Manila days, oldest first. */
export function lastSevenDays(asOf: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    out.push(manilaDayKey(new Date(asOf.getTime() - i * 86_400_000)));
  }
  return out;
}

/**
 * Where a prospect or merchant actually is, for the distance check.
 *
 * Returns null rather than a guess when there is no stored coordinate. The
 * whole point of `checkVisit`'s four outcomes is that "we do not know where
 * this business is" is a different fact from "they logged it two miles away".
 */
export async function subjectLocation(
  partnerId: string,
  subjectType: string,
  productId: string | null,
  subjectId: string,
): Promise<{ point: Point | null; name: string | null }> {
  try {
    if (subjectType === "prospect") {
      const p = await systemDb((tx) =>
        tx.prospect.findFirst({
          where: { id: subjectId, partnerId },
          select: { businessName: true, latitude: true, longitude: true },
        }),
      );
      /**
       * THE COORDINATES LEARNED FROM THE FIRST VISIT, not the address string.
       *
       * This used to return `point: null` unconditionally, with a comment
       * saying prospects carry an address and nothing here geocodes. That was
       * true until `latitude`/`longitude` were added and the first visit
       * started writing them — after which this function was the only thing
       * standing between that column and the check it exists for. Every repeat
       * visit still came back `no_address`, so the pin was written and never
       * read, and "were they where they were last time?" stayed unanswerable.
       *
       * Still honestly null on a FIRST visit, because there is nothing to
       * compare to yet. That is the case the photo covers.
       */
      const point =
        p && isUsable({ lat: p.latitude ?? NaN, lng: p.longitude ?? NaN })
          ? { lat: p.latitude as number, lng: p.longitude as number }
          : null;
      return { point, name: p?.businessName ?? null };
    }
    if (productId === "pharmacy") {
      const m = await systemDb((tx) =>
        tx.pharmacy.findFirst({
          where: { id: subjectId, partnerId },
          select: { name: true },
        }),
      );
      return { point: null, name: m?.name ?? null };
    }
    const m = await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { id: subjectId, partnerId },
        select: { name: true, latitude: true, longitude: true },
      }),
    );
    const point =
      m && isUsable({ lat: m.latitude ?? NaN, lng: m.longitude ?? NaN })
        ? { lat: m.latitude as number, lng: m.longitude as number }
        : null;
    return { point, name: m?.name ?? null };
  } catch {
    return { point: null, name: null };
  }
}
