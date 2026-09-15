import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The partner waitlist, as HQ works it.
 *
 * WHERE THESE COME FROM: canvexia.com's application form, and eventually
 * Messenger (`source`). The city is FREE TEXT and deliberately not a foreign
 * key — somebody applying for a city that is not in the seeded 143 is a real
 * signal about where demand is, and forcing it into a dropdown would erase
 * exactly that signal.
 */

export interface ApplicationRow {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  city: string;
  province: string | null;
  currentWork: string | null;
  hoursPerWeek: string;
  soldBefore: boolean;
  soldWhat: string | null;
  howHeard: string | null;
  source: string;
  status: string;
  notes: string | null;
  contactedAt: Date | null;
  convertedPartnerId: string | null;
  territoryId: string | null;
  territoryName: string | null;
  territoryTaken: boolean;
  createdAt: Date;
  /** Whole days since it arrived. The number HQ is actually judged on. */
  ageDays: number;
}

export interface CityGroup {
  city: string;
  applicants: number;
  open: number;
  territoryId: string | null;
  taken: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

export async function listApplications(
  asOf: Date = new Date(),
): Promise<{ rows: ApplicationRow[]; cities: CityGroup[] }> {
  return systemDb(async (tx) => {
    const [apps, territories] = await Promise.all([
      tx.partnerWaitlist
        .findMany({
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fullName: true,
            email: true,
            mobile: true,
            city: true,
            province: true,
            currentWork: true,
            hoursPerWeek: true,
            soldBefore: true,
            soldWhat: true,
            howHeard: true,
            source: true,
            status: true,
            notes: true,
            contactedAt: true,
            convertedPartnerId: true,
            territoryId: true,
            createdAt: true,
          },
        })
        .catch(() => []),
      tx.territory
        .findMany({ select: { id: true, name: true, partnerId: true } })
        .catch(() => [] as { id: string; name: string; partnerId: string | null }[]),
    ]);

    const byId = new Map(territories.map((t) => [t.id, t]));
    const byName = new Map(territories.map((t) => [t.name.trim().toLowerCase(), t]));

    const rows: ApplicationRow[] = apps.map((a) => {
      // The mapped territory if HQ has set one, otherwise a name match — which
      // is best-effort by design, see the note at the top.
      const t = a.territoryId ? byId.get(a.territoryId) : byName.get(a.city.trim().toLowerCase());
      return {
        ...a,
        hoursPerWeek: String(a.hoursPerWeek),
        territoryName: t?.name ?? null,
        territoryTaken: !!t?.partnerId,
        ageDays: Math.floor((asOf.getTime() - a.createdAt.getTime()) / DAY),
      };
    });

    const grouped = new Map<string, CityGroup>();
    for (const r of rows) {
      const key = r.city.trim() || "(no city)";
      const g = grouped.get(key) ?? {
        city: key,
        applicants: 0,
        open: 0,
        territoryId: r.territoryId,
        taken: r.territoryTaken,
      };
      g.applicants += 1;
      // "Open" is anything not yet resolved. A city with nine applicants of
      // which nine were rejected is not demand, and counting it as such would
      // put it on the attention list forever.
      if (r.status !== "rejected" && r.status !== "converted") g.open += 1;
      grouped.set(key, g);
    }

    const cities = [...grouped.values()].sort(
      (a, b) => b.open - a.open || b.applicants - a.applicants || a.city.localeCompare(b.city),
    );

    return { rows, cities };
  });
}

export async function getApplication(id: string): Promise<ApplicationRow | null> {
  const { rows } = await listApplications();
  return rows.find((r) => r.id === id) ?? null;
}

/**
 * The "Book a call" link.
 *
 * HQ's OWN calendar, stored in program settings and deliberately separate from
 * canvexia.com's `NEXT_PUBLIC_BOOKING_URL`: they are different conversations,
 * and the landing page's link is inlined at build time anyway.
 *
 * Google's booking pages do NOT accept a prefilled email through a query
 * string. The brief asks for one "if the provider supports it" — it does not,
 * so the screen offers the applicant's address to copy rather than appending a
 * parameter that silently does nothing.
 */
export async function getHqBookingUrl(): Promise<string | null> {
  try {
    const row = await systemDb((tx) =>
      tx.programSetting.findUnique({
        where: { id: "program" },
        select: { hqBookingUrl: true },
      }),
    );
    return row?.hqBookingUrl?.trim() || null;
  } catch {
    return null;
  }
}
