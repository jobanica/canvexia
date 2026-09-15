import Link from "next/link";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import {
  attendanceWeek,
  lastSevenDays,
  manilaDayKey,
  manilaDayRange,
  visitsForDay,
} from "@/server/partners/attendance";
import { PortalShell } from "@/components/partner/PortalShell";
// A plain import, not next/dynamic with ssr:false — Next 15 refuses that from
// a Server Component. It is safe because StaffMap is a client component that
// imports Leaflet INSIDE an effect, so the library never loads on the server
// whatever the boundary does.
import { StaffMap, type MapPin } from "@/components/partner/StaffMap";

export const metadata = { title: "Attendance · CANVEXIA" };

const FLAG_COPY: Record<string, string> = {
  no_check_in: "visits but no check-in",
  no_visits: "checked in, no visits",
  never_checked_out: "never checked out",
  gps_mismatch: "a visit far from the address",
};

/**
 * The manager's view: today on a map, the week in a table.
 *
 * `attendance.view_all`. A salesperson sees their own day on /partner/attendance
 * and has no route to anybody else's — that is the seat arm in RLS as well as
 * the gate here.
 */
export default async function AttendanceManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const partner = await requirePartnerPageWith("attendance.view_all");
  const q = await searchParams;
  const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(q.day ?? "") ? q.day! : manilaDayKey();
  const days = lastSevenDays();

  const { from, to } = manilaDayRange(dayKey);
  const [week, visits, sessions, seats] = await Promise.all([
    attendanceWeek(partner.id, days),
    visitsForDay(partner.id, dayKey),
    systemDb((tx) =>
      tx.attendanceSession
        .findMany({
          where: { partnerId: partner.id, dayKey },
          select: {
            partnerUserId: true,
            checkInAt: true,
            checkInLat: true,
            checkInLng: true,
          },
        })
        .catch(() => []),
    ),
    systemDb((tx) =>
      tx.partnerUser.findMany({
        where: { partnerId: partner.id },
        select: { id: true, name: true, email: true },
      }),
    ),
  ]);

  const nameOf = new Map(seats.map((s) => [s.id, s.name ?? s.email]));

  const pins: MapPin[] = [
    ...sessions
      .filter((s) => s.checkInLat !== null && s.checkInLng !== null)
      .map((s) => ({
        id: `in:${s.partnerUserId}`,
        lat: s.checkInLat as number,
        lng: s.checkInLng as number,
        label: nameOf.get(s.partnerUserId) ?? "Someone",
        detail: `Checked in ${fmtTime(s.checkInAt)}`,
        kind: "in" as const,
      })),
    ...visits
      .filter((v) => v.lat !== null && v.lng !== null)
      .map((v) => ({
        id: `visit:${v.id}`,
        lat: v.lat as number,
        lng: v.lng as number,
        label: v.subjectName ?? "Visit",
        detail: `${nameOf.get(v.partnerUserId) ?? "Someone"} · ${fmtTime(v.occurredAt)}`,
        kind: v.flag === "far" ? ("far" as const) : ("visit" as const),
      })),
  ];

  return (
    <PortalShell
      partner={partner}
      title="Attendance"
      subtitle="Where the team worked, and what they logged."
      actions={
        <Link
          href={`/api/partner/attendance.csv?from=${days[0]}&to=${days[days.length - 1]}`}
          className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
        >
          Export CSV
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => (
            <Link
              key={d}
              href={`/partner/attendance/manager?day=${d}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                d === dayKey
                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                  : "border-brand-ink/15 bg-white text-brand-ink/55 hover:bg-brand-surface"
              }`}
            >
              {new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", {
                weekday: "short",
                day: "numeric",
                timeZone: "Asia/Manila",
              })}
            </Link>
          ))}
        </div>

        <StaffMap pins={pins} />

        <div className="overflow-x-auto rounded-tile border border-brand-ink/10 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-ink/10 text-left text-xs uppercase tracking-wide text-brand-ink/45">
                <th className="px-4 py-3 font-semibold">Person</th>
                {days.map((d) => (
                  <th key={d} className="px-2 py-3 text-center font-semibold">
                    {new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", {
                      weekday: "narrow",
                      timeZone: "Asia/Manila",
                    })}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold">Days</th>
                <th className="px-4 py-3 text-right font-semibold">Visits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-ink/[0.07]">
              {week.map((s) => (
                <tr key={s.partnerUserId}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/partner/team/staff/${s.partnerUserId}`}
                      className="font-medium hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  {s.days.map((d) => (
                    <td
                      key={d.dayKey}
                      className="px-2 py-3 text-center"
                      title={
                        d.flags.length > 0
                          ? d.flags.map((f) => FLAG_COPY[f]).join("; ")
                          : d.firstIn
                            ? `${fmtTime(d.firstIn)}${d.lastOut ? `–${fmtTime(d.lastOut)}` : ""}`
                            : "No check-in"
                      }
                    >
                      <Cell day={d} />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums">{s.daysPresent}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.totalVisits}</td>
                </tr>
              ))}
              {week.length === 0 && (
                <tr>
                  <td colSpan={days.length + 3} className="px-4 py-6 text-sm text-brand-ink/50">
                    Nobody on the team yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs leading-relaxed text-brand-ink/45">
          A location is captured only when somebody taps check in, check out, or logs a
          visit. Nothing is tracked in between, and a phone that refused the permission
          still records the work — it just has no pin.
        </p>
      </div>
    </PortalShell>
  );
}

function Cell({ day }: { day: { firstIn: Date | null; visits: number; flags: string[] } }) {
  if (!day.firstIn) {
    return <span className="text-brand-ink/25">·</span>;
  }
  const bad = day.flags.filter((f) => f !== "no_visits").length > 0;
  return (
    <span
      className={`inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        bad
          ? "bg-guava/15 text-guava"
          : day.visits > 0
            ? "bg-brand-primary/12 text-brand-primary"
            : "bg-brand-ink/5 text-brand-ink/50"
      }`}
    >
      {day.visits}
    </span>
  );
}

const fmtTime = (d: Date) =>
  new Date(d).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
