import { redirect } from "next/navigation";
import { getEmployeeSession, logoutEmployee } from "@/server/hr/employee-auth";
import { getMyStatus, getMyAttendance, getMyLeave } from "@/server/hr/employee-portal";
import { EmployeeClock } from "@/components/hr/EmployeeClock";
import { EmployeeLeave } from "@/components/hr/EmployeeLeave";
import { EmployeeLogin } from "@/components/hr/EmployeeLogin";
import { manilaShortDateTime } from "@/lib/time/manila";

// This page renders on the server (UTC on Vercel), so formatting without an
// explicit timezone showed every shift 8 hours early — a 5:56 PM clock-in read
// as 9:56 AM, while the admin timesheet (which formats in Manila) was right.
const fmt = manilaShortDateTime;

export default async function EmployeePortal() {
  const session = await getEmployeeSession();

  if (!session) {
    return (
      <div className="min-h-screen bg-cream px-4 py-16">
        <EmployeeLogin />
      </div>
    );
  }

  const [status, attendance, leave] = await Promise.all([
    getMyStatus(),
    getMyAttendance(),
    getMyLeave(),
  ]);

  async function signOut() {
    "use server";
    await logoutEmployee();
    redirect("/employee");
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-cream px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{session.fullName}</h1>
          <p className="text-sm text-plum-ink/55">My attendance</p>
        </div>
        <form action={signOut}>
          <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">Sign out</button>
        </form>
      </div>

      {status && (
        <div className="mb-4">
          <EmployeeClock initial={status} />
        </div>
      )}

      {leave && (
        <div className="mb-4">
          <EmployeeLeave leave={leave} />
        </div>
      )}

      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Recent attendance</h2>
        {attendance.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/50">No records yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-plum-ink/5 text-sm">
            {attendance.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <span>
                  {fmt(e.clockIn)}
                  {e.clockOut ? ` → ${fmt(e.clockOut)}` : <span className="ml-2 text-mango">on the clock</span>}
                </span>
                <span className="text-xs text-plum-ink/40">{e.source}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
