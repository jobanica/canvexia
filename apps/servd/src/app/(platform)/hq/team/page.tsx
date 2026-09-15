import { requireHqPage } from "@/server/hq/auth";
import { listHqSeats } from "@/server/hq/team";
import { HqShell } from "@/components/hq/HqShell";
import { Avatar } from "@/components/canvexia/Cards";
import { AddHqSeat, SeatStatus } from "@/components/hq/TeamForms";

export default async function HqTeamPage() {
  // Super admin only — the capability gate, not the path list, is what decides.
  const user = await requireHqPage("hq.team");
  const seats = await listHqSeats();

  return (
    <HqShell
      user={user}
      title="HQ team"
      subtitle={`${seats.filter((s) => s.status === "active").length} active of ${seats.length}.`}
    >
      <div className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
            <tr>
              <th className="px-5 py-3 font-semibold">Person</th>
              <th className="px-3 py-3 font-semibold">Role</th>
              <th className="px-3 py-3 font-semibold">Added by</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-ink/[0.06]">
            {seats.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3">
                  <span className="flex items-center gap-3">
                    <Avatar name={s.displayName ?? s.email} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.displayName ?? s.email}</span>
                      {s.displayName && <span className="block truncate text-xs text-brand-ink/45">{s.email}</span>}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                      s.role === "super_admin" ? "bg-brand-ink text-white" : "bg-brand-ink/5 text-brand-ink/60"
                    }`}
                  >
                    {s.role.replace("_", " ")}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-brand-ink/50">
                  {s.invitedByEmail ?? "the bootstrap"}
                </td>
                <td className="px-3 py-3 text-brand-ink/60">{s.status}</td>
                <td className="px-5 py-3 text-right">
                  <SeatStatus id={s.id} email={s.email} active={s.status === "active"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
          A deactivated seat is kept, not deleted — the audit log names an actor, and removing the
          row would make every past HQ action anonymous.
        </p>
      </div>

      <div className="mt-4">
        <AddHqSeat />
      </div>
    </HqShell>
  );
}
