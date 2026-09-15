import Link from "next/link";
import { requireHqPage } from "@/server/hq/auth";
import { listTerritories } from "@/server/hq/territories";
import { systemDb } from "@/server/tenancy/scoped-db";
import { HqShell } from "@/components/hq/HqShell";
import {
  AssignTerritory,
  ImportTerritories,
  MergeTerritory,
  ReleaseTerritory,
  SplitTerritory,
  TerritoryForm,
} from "@/components/hq/TerritoryForms";

const STATUS_TONE: Record<string, string> = {
  available: "bg-brand-primary/10 text-brand-primary",
  reserved: "bg-brand-accent/15 text-brand-accent",
  taken: "bg-brand-ink text-white",
  hq: "bg-brand-ink/5 text-brand-ink/60",
};

/**
 * The 143 cities, and who holds each.
 *
 * NO MAP, and the screen says why rather than leaving a blank panel. The brief
 * asks for one "using the coordinates already in the seed"; the seed is
 * `[name, province, region]` and the table has no lat/lng. A map with nothing
 * on it is worse than the table it would replace.
 *
 * Filtering is by query string, not client state: "show me every unassigned
 * Region XI city" is a URL somebody can send to somebody else.
 */
export default async function HqTerritoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; region?: string; edit?: string }>;
}) {
  const user = await requireHqPage("territories.write");
  const [rows, sp, partners] = await Promise.all([
    listTerritories(),
    searchParams,
    systemDb((tx) =>
      tx.partner.findMany({
        where: { status: "approved" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ),
  ]);

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (sp.status && r.status !== sp.status) return false;
    if (sp.region && r.region !== sp.region) return false;
    if (q && !`${r.name} ${r.province} ${r.region}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const regions = [...new Set(rows.map((r) => r.region))].sort();
  const editing = sp.edit ? rows.find((r) => r.id === sp.edit) : undefined;
  const taken = rows.filter((r) => r.partnerId).length;

  return (
    <HqShell
      user={user}
      title="Territories"
      subtitle={`${rows.length} cities · ${taken} licensed · ${rows.length - taken} available`}
      actions={
        <a
          href="/hq/territories/export"
          className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface"
        >
          Export CSV
        </a>
      }
    >
      <form className="flex flex-wrap items-end gap-2 rounded-tile border border-brand-ink/10 bg-white p-4">
        <label className="min-w-0 flex-1 text-xs font-semibold text-brand-ink/70">
          Search
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="City, province or region"
            className="mt-1 block min-h-[38px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-brand-ink/70">
          Status
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="">Any</option>
            {["available", "reserved", "taken", "hq"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-brand-ink/70">
          Region
          <select
            name="region"
            defaultValue={sp.region ?? ""}
            className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="">Any</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-[38px] rounded-full bg-brand-ink px-4 text-sm font-semibold text-white">
          Filter
        </button>
      </form>

      <p className="mt-3 text-xs text-brand-ink/40">
        No map yet: the city list carries no coordinates, and a map with nothing on it is worse
        than this table. Geocoding is a follow-up.
      </p>

      <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
              <tr>
                <th className="px-5 py-3 font-semibold">City</th>
                <th className="px-3 py-3 font-semibold">Region</th>
                <th className="px-3 py-3 font-semibold">Tier</th>
                <th className="px-3 py-3 text-right font-semibold">Fee</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Holder</th>
                <th className="px-5 py-3 text-right font-semibold">Applicants</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-ink/[0.06]">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-brand-surface/60">
                  <td className="px-5 py-3">
                    <Link href={`/hq/territories?edit=${r.id}`} className="font-semibold">
                      {r.name}
                    </Link>
                    <span className="block text-xs text-brand-ink/45">
                      {r.province}
                      {r.parentName && ` · district of ${r.parentName}`}
                      {r.childCount > 0 && ` · split into ${r.childCount}`}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-brand-ink/60">{r.region}</td>
                  <td className="px-3 py-3 text-brand-ink/60">{r.tier}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    ₱{r.licenseFee.toLocaleString("en-PH")}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                        STATUS_TONE[r.status] ?? "bg-brand-ink/5"
                      }`}
                    >
                      {r.assignable ? r.status : "split"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {r.partnerId ? (
                      <Link href={`/hq/partners/${r.partnerId}`} className="text-brand-primary">
                        {r.partnerName}
                      </Link>
                    ) : (
                      <span className="text-brand-ink/30">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {r.applicants > 0 ? (
                      <Link
                        href={`/hq/applications?city=${encodeURIComponent(r.name)}`}
                        className={r.applicants >= 5 && !r.partnerId ? "font-semibold text-brand-primary" : ""}
                      >
                        {r.applicants}
                      </Link>
                    ) : (
                      <span className="text-brand-ink/25">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
            No city matches that.
          </p>
        )}
      </div>

      {editing && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
          <TerritoryForm territory={editing} />
          <div className="space-y-4">
            {editing.partnerId ? (
              <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
                <h2 className="font-heading text-lg font-bold">Licensed</h2>
                <p className="mt-1 text-sm text-brand-ink/55">
                  Held by {editing.partnerName}.
                </p>
                <div className="mt-3">
                  <ReleaseTerritory
                    territoryId={editing.id}
                    holder={editing.partnerName ?? "its partner"}
                  />
                </div>
              </div>
            ) : editing.assignable ? (
              <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
                <h2 className="font-heading text-lg font-bold">Assign</h2>
                <div className="mt-3">
                  <AssignTerritory
                    territoryId={editing.id}
                    territoryName={editing.name}
                    partners={partners}
                  />
                </div>
              </div>
            ) : null}

            {editing.childCount > 0 ? (
              <MergeTerritory
                parentId={editing.id}
                parentName={editing.name}
                childCount={editing.childCount}
              />
            ) : (
              !editing.partnerId && (
                <SplitTerritory parentId={editing.id} parentName={editing.name} />
              )
            )}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
        {!editing && <TerritoryForm />}
        <ImportTerritories />
      </div>
    </HqShell>
  );
}
