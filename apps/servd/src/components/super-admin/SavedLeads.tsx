"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  setProspectStatus,
  enrichProspect,
  deleteProspect,
} from "@/server/prospecting/actions";
import { addProspectToCrm, addProspectsToCrm } from "@/server/crm/actions";
import { PROSPECT_STATUSES, type ProspectStatus } from "@/lib/prospecting/types";
import type { ProspectLeadRow } from "@/server/prospecting/queries";

const STATUS_STYLE: Record<ProspectStatus, string> = {
  new: "bg-plum-ink/10 text-plum-ink/70",
  contacted: "bg-sky-500/15 text-sky-700",
  interested: "bg-amber-500/15 text-amber-700",
  converted: "bg-mango/15 text-mango",
  rejected: "bg-guava/15 text-guava",
};

function mapUrl(lat: number | null, lng: number | null, address: string | null): string | null {
  if (lat != null && lng != null) return `https://www.google.com/maps?q=${lat},${lng}`;
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return null;
}

export function SavedLeads({ leads }: { leads: ProspectLeadRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enriching, setEnriching] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProspectStatus | "all">("all");
  const [crmAdded, setCrmAdded] = useState<Record<string, "added" | "dupe">>({});
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ added: number; skipped: number } | null>(null);

  const shown = filter === "all" ? leads : leads.filter((l) => l.status === filter);

  async function addAllToCrm() {
    setBulkAdding(true);
    setBulkResult(null);
    const res = await addProspectsToCrm(
      shown.map((l) => ({
        name: l.name,
        facebookUrl: l.facebook,
        phone: l.phone,
        email: l.email,
        website: l.website,
      })),
    );
    setBulkAdding(false);
    if (res.error) return;
    setBulkResult({ added: res.added ?? 0, skipped: res.skipped ?? 0 });
    setCrmAdded((prev) => {
      const next = { ...prev };
      for (const l of shown) next[l.id] = next[l.id] ?? "added";
      return next;
    });
    router.refresh();
  }

  async function toCrm(l: ProspectLeadRow) {
    const res = await addProspectToCrm({
      name: l.name,
      facebookUrl: l.facebook,
      phone: l.phone,
      email: l.email,
      website: l.website,
    });
    if (res.error) return;
    setCrmAdded((prev) => ({ ...prev, [l.id]: res.duplicate ? "dupe" : "added" }));
  }

  function changeStatus(id: string, status: ProspectStatus) {
    startTransition(async () => {
      await setProspectStatus(id, status);
      router.refresh();
    });
  }

  async function enrich(id: string) {
    setEnriching(id);
    await enrichProspect(id);
    setEnriching(null);
    router.refresh();
  }

  function remove(id: string) {
    if (!confirm("Remove this lead?")) return;
    startTransition(async () => {
      await deleteProspect(id);
      router.refresh();
    });
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-tile border border-dashed border-plum-ink/15 bg-white p-6 text-center text-sm text-plum-ink/50">
        No saved leads yet. Search a city above and save the restaurants you want to pursue.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-plum-ink/40">Filter</span>
        {(["all", ...PROSPECT_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
              filter === s ? "bg-brand-gradient text-white" : "bg-plum-ink/5 text-plum-ink/60"
            }`}
          >
            {s}
            {s !== "all" && (
              <span className="ml-1 opacity-70">{leads.filter((l) => l.status === s).length}</span>
            )}
          </button>
        ))}
        <button
          onClick={addAllToCrm}
          disabled={bulkAdding}
          className="ml-auto rounded-full border border-brand-primary/40 px-3 py-1 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5 disabled:opacity-60"
        >
          {bulkAdding
            ? "Adding…"
            : bulkResult
              ? `Added ${bulkResult.added} · ${bulkResult.skipped} already in CRM`
              : `+ Add ${filter === "all" ? "all" : "these"} to CRM`}
        </button>
      </div>

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr className="border-b border-plum-ink/10">
              <th className="px-3 py-2">Restaurant</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Web / FB</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => {
              const map = mapUrl(l.latitude, l.longitude, l.address);
              return (
                <tr key={l.id} className="border-t border-plum-ink/5 align-top">
                  <td className="px-3 py-2">
                    <span className="font-medium">{l.name}</span>
                    {l.address && <span className="block text-xs text-plum-ink/45">{l.address}</span>}
                    {map && (
                      <a href={map} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-primary">
                        map ↗
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-plum-ink/70">
                    {l.phone ?? <span className="text-plum-ink/25">—</span>}
                  </td>
                  <td className="px-3 py-2 text-plum-ink/70">
                    {l.email ?? <span className="text-plum-ink/25">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      {l.website && (
                        <a href={l.website} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-primary">
                          web
                        </a>
                      )}
                      {l.facebook && (
                        <a href={l.facebook} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#1877f2]">
                          fb
                        </a>
                      )}
                      {!l.website && !l.facebook && <span className="text-plum-ink/25">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={l.status}
                      onChange={(e) => changeStatus(l.id, e.target.value as ProspectStatus)}
                      disabled={pending}
                      className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[l.status]}`}
                    >
                      {PROSPECT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      {crmAdded[l.id] ? (
                        <span className="rounded-lg bg-mango/15 px-2.5 py-1.5 text-xs font-semibold text-mango">
                          {crmAdded[l.id] === "dupe" ? "In CRM" : "Added ✓"}
                        </span>
                      ) : (
                        <button
                          onClick={() => toCrm(l)}
                          title="Add this lead to the outreach CRM"
                          className="rounded-lg border border-brand-primary/40 px-2.5 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5"
                        >
                          + Add to CRM
                        </button>
                      )}
                      {l.website && (!l.email || !l.facebook) && (
                        <button
                          onClick={() => enrich(l.id)}
                          disabled={enriching === l.id}
                          title="Scrape the website for email & Facebook"
                          className="rounded-lg border border-plum-ink/15 px-2.5 py-1.5 text-xs font-semibold text-plum-ink/70 hover:bg-plum-ink/5 disabled:opacity-60"
                        >
                          {enriching === l.id ? "Finding…" : "Find contacts"}
                        </button>
                      )}
                      <button
                        onClick={() => remove(l.id)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-guava hover:bg-guava/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
