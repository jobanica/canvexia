import Link from "next/link";
import { requireHqPage } from "@/server/hq/auth";
import { listApplications } from "@/server/hq/applications";
import { HqShell } from "@/components/hq/HqShell";
import { Avatar } from "@/components/canvexia/Cards";

const STATUS_TONE: Record<string, string> = {
  new: "bg-brand-primary/10 text-brand-primary",
  contacted: "bg-brand-accent/15 text-brand-accent",
  shortlisted: "bg-brand-ink text-white",
  rejected: "bg-brand-ink/5 text-brand-ink/50",
  converted: "bg-brand-primary text-white",
};

const HOURS_LABEL: Record<string, string> = {
  under5: "under 5 h/wk",
  h5to10: "5–10 h/wk",
  h10to20: "10–20 h/wk",
  h20plus: "20+ h/wk",
};

export default async function HqApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; status?: string }>;
}) {
  const user = await requireHqPage("applications.write");
  const [{ rows, cities }, sp] = await Promise.all([listApplications(), searchParams]);

  const filtered = rows.filter((r) => {
    if (sp.city && r.city.trim().toLowerCase() !== sp.city.trim().toLowerCase()) return false;
    if (sp.status && r.status !== sp.status) return false;
    return true;
  });

  return (
    <HqShell
      user={user}
      title="Applications"
      subtitle={
        rows.length === 0
          ? "Nobody has applied yet."
          : `${rows.length} application${rows.length === 1 ? "" : "s"} from ${cities.length} cit${cities.length === 1 ? "y" : "ies"}.`
      }
    >
      {rows.length === 0 ? (
        <div className="rounded-tile border border-dashed border-brand-ink/15 bg-white p-10 text-center">
          <p className="font-heading text-lg font-bold">No applications</p>
          <p className="mt-1 text-sm text-brand-ink/55">
            They arrive from canvexia.com&rsquo;s partner form.
          </p>
        </div>
      ) : (
        <>
          {/* Cities first: the question HQ actually opens this screen with is
              "where is the demand", not "who applied most recently". */}
          <div className="flex flex-wrap gap-2">
            <Link
              href="/hq/applications"
              className={`rounded-full border px-3.5 py-1.5 text-sm ${
                sp.city
                  ? "border-brand-ink/12 text-brand-ink/60 hover:bg-brand-surface"
                  : "border-brand-ink bg-brand-ink font-semibold text-white"
              }`}
            >
              All cities
            </Link>
            {cities.map((c) => (
              <Link
                key={c.city}
                href={`/hq/applications?city=${encodeURIComponent(c.city)}`}
                className={`rounded-full border px-3.5 py-1.5 text-sm ${
                  sp.city?.toLowerCase() === c.city.toLowerCase()
                    ? "border-brand-ink bg-brand-ink font-semibold text-white"
                    : c.open >= 5 && !c.taken
                      ? "border-brand-primary/40 bg-brand-primary/[0.06] font-semibold text-brand-primary"
                      : "border-brand-ink/12 text-brand-ink/60 hover:bg-brand-surface"
                }`}
              >
                {c.city}
                <span className="ml-1.5 tabular-nums opacity-60">{c.open}</span>
                {c.taken && <span className="ml-1.5 text-[0.65rem] uppercase opacity-60">taken</span>}
              </Link>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Applicant</th>
                    <th className="px-3 py-3 font-semibold">City</th>
                    <th className="px-3 py-3 font-semibold">Hours</th>
                    <th className="px-3 py-3 font-semibold">Sold before</th>
                    <th className="px-3 py-3 font-semibold">Source</th>
                    <th className="px-3 py-3 text-right font-semibold">Age</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-ink/[0.06]">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-brand-surface/60">
                      <td className="px-5 py-3">
                        <Link href={`/hq/applications/${r.id}`} className="flex items-center gap-3">
                          <Avatar name={r.fullName} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{r.fullName}</span>
                            <span className="block truncate text-xs text-brand-ink/45">{r.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        {r.city}
                        {r.territoryTaken && (
                          <span className="block text-xs text-brand-ink/40">already licensed</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-brand-ink/60">
                        {HOURS_LABEL[r.hoursPerWeek] ?? r.hoursPerWeek}
                      </td>
                      <td className="px-3 py-3 text-brand-ink/60">{r.soldBefore ? "Yes" : "No"}</td>
                      <td className="px-3 py-3 text-brand-ink/60">{r.source}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className={r.ageDays > 7 && r.status === "new" ? "font-semibold text-guava" : ""}>
                          {r.ageDays}d
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                            STATUS_TONE[r.status] ?? "bg-brand-ink/5"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
                Nothing matches that filter.
              </p>
            )}
          </div>
        </>
      )}
    </HqShell>
  );
}
