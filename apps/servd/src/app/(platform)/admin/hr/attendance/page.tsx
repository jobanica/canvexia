import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getAttendanceToday } from "@/server/hr/attendance";
import { manilaTime, manilaDate } from "@/lib/time/manila";

const time = manilaTime;

export default async function AttendanceDashboard() {
  const { restaurantId, eligible } = await requireHrPage();
  const locked = await featureLockOr(restaurantId, "hr", "Attendance");
  if (locked) return locked;
  const a = await getAttendanceToday(restaurantId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
        <h1 className="font-heading text-2xl font-bold">Attendance — today</h1>
        <p className="text-sm text-plum-ink/50">{manilaDate(new Date())}</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["On the clock now", a.onClockNow.length],
          ["Clocked in today", `${a.presentCount} / ${a.totalActive}`],
          ["Not in yet", a.notClockedIn.length],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-tile border border-plum-ink/10 bg-white p-5">
            <p className="text-xs font-medium text-plum-ink/50">{label}</p>
            <p className="mt-1 font-heading text-3xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* On the clock now */}
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <h2 className="font-heading text-lg font-bold">On the clock now</h2>
          {a.onClockNow.length === 0 ? (
            <p className="mt-2 text-sm text-plum-ink/50">Nobody is clocked in.</p>
          ) : (
            <ul className="mt-3 divide-y divide-plum-ink/5 text-sm">
              {a.onClockNow.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-mango" />
                    {e.name}
                  </span>
                  <span className="text-plum-ink/60">
                    since {time(e.since)} · <span className="font-semibold">{e.hoursSoFar}h</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Not clocked in */}
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <h2 className="font-heading text-lg font-bold">Not clocked in today</h2>
          {a.notClockedIn.length === 0 ? (
            <p className="mt-2 text-sm text-plum-ink/50">Everyone is in 🎉</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {a.notClockedIn.map((e) => (
                <li key={e.id} className="rounded-full bg-cream px-3 py-1 text-plum-ink/70">{e.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* First clock-in today */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">First clock-in today</h2>
        {a.clockedInToday.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/50">No clock-ins yet today.</p>
        ) : (
          <ul className="mt-3 divide-y divide-plum-ink/5 text-sm">
            {a.clockedInToday.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <span>{e.name}</span>
                <span className="text-plum-ink/60">{time(e.firstIn)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
