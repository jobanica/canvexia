"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateScriptStats } from "@/server/content/actions";
import { SCRIPT_STATUSES, type ScriptStatus } from "@/lib/content/stats";
import type { LibraryScriptRow } from "@/server/content/queries";
import { ScriptCard } from "./ScriptCard";

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "JAB", label: "Jabs" },
  { value: "RIGHT_HOOK", label: "Hooks" },
];

export function LibraryTable({
  scripts,
  pillarNames,
}: {
  scripts: LibraryScriptRow[];
  pillarNames: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pillarFilter, setPillarFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [remixing, setRemixing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      scripts.filter(
        (s) =>
          (typeFilter === "all" || s.type === typeFilter) &&
          (statusFilter === "all" || s.status === statusFilter) &&
          (pillarFilter === "all" || s.pillarName === pillarFilter),
      ),
    [scripts, typeFilter, statusFilter, pillarFilter],
  );

  function save(id: string, patch: Record<string, unknown>) {
    startTransition(async () => {
      const res = await updateScriptStats(id, patch);
      if (res.error) setNote(res.error);
      else router.refresh();
    });
  }

  async function remix(id: string) {
    setRemixing(id);
    setNote(null);
    try {
      const res = await fetch("/super-admin/content-engine/api/remix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: id }),
      });
      const json = await res.json();
      if (!res.ok) setNote(json.error ?? "Remix failed.");
      else {
        setNote(`Created ${json.created?.length ?? 0} variation(s). They're in the library as SCRIPTED.`);
        router.refresh();
      }
    } catch {
      setNote("Couldn't reach the generator.");
    } finally {
      setRemixing(null);
    }
  }

  const numCell = (id: string, field: "saves" | "shares" | "dms", value: number | null) => (
    <input
      type="number"
      min={0}
      defaultValue={value ?? ""}
      onBlur={(e) => {
        const next = e.target.value === "" ? null : Number(e.target.value);
        if (next !== value) save(id, { [field]: e.target.value });
      }}
      className="w-16 rounded-md border border-plum-ink/15 px-2 py-1 text-sm"
    />
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-plum-ink/15 p-0.5">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                typeFilter === t.value ? "bg-brand-gradient text-white" : "text-plum-ink/55"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs"
        >
          <option value="all">All statuses</option>
          {SCRIPT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={pillarFilter}
          onChange={(e) => setPillarFilter(e.target.value)}
          className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs"
        >
          <option value="all">All pillars</option>
          {pillarNames.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="text-xs text-plum-ink/45">{shown.length} shown</span>
        {note && <span className="text-xs text-brand-primary">{note}</span>}
      </div>

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr className="border-b border-plum-ink/10">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Pillar</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Saves</th>
              <th className="px-3 py-2">Shares</th>
              <th className="px-3 py-2">DMs</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-plum-ink/50">
                  No scripts here.
                </td>
              </tr>
            ) : (
              shown.map((s) => (
                <Fragment key={s.id}>
                  <tr className="border-t border-plum-ink/5 align-middle">
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setExpanded((e) => (e === s.id ? null : s.id))}
                        className="text-left font-medium hover:text-brand-primary"
                      >
                        {s.title}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          s.type === "JAB"
                            ? "bg-sky-500/15 text-sky-700"
                            : "bg-brand-primary/15 text-brand-primary"
                        }`}
                      >
                        {s.type === "JAB" ? "Jab" : "Hook"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-plum-ink/60">{s.pillarName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <select
                        value={s.status}
                        onChange={(e) => save(s.id, { status: e.target.value as ScriptStatus })}
                        className="rounded-md border border-plum-ink/15 px-2 py-1 text-xs"
                      >
                        {SCRIPT_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">{numCell(s.id, "saves", s.saves)}</td>
                    <td className="px-3 py-2">{numCell(s.id, "shares", s.shares)}</td>
                    <td className="px-3 py-2">{numCell(s.id, "dms", s.dms)}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => remix(s.id)}
                        disabled={remixing === s.id || pending}
                        className="rounded-lg bg-brand-gradient px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {remixing === s.id ? "Remixing…" : "Remix ×3"}
                      </button>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr className="bg-cream/30">
                      <td colSpan={8} className="px-3 py-3">
                        <ScriptCard
                          data={{
                            id: s.id,
                            type: s.type,
                            platform: s.platform,
                            lengthSec: s.lengthSec,
                            pillar: s.pillarName,
                            script: s.script,
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
