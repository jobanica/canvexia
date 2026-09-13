"use client";

import { useState } from "react";

interface CreatedItem {
  id: string;
  title: string;
  type: "JAB" | "RIGHT_HOOK";
  pillar: string | null;
  scheduledFor: string;
}

const PLATFORMS = [
  { value: "reels", label: "Reels" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
];
const LENGTHS = [15, 30, 45, 60, 90];

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Batch form → calls the batch API → preview of the generated, scheduled set.
 * Items are saved straight to the calendar (status SCRIPTED with a date).
 */
export function BatchClient({ defaultRatio, enabled }: { defaultRatio: number; enabled: boolean }) {
  const [count, setCount] = useState(8);
  const [jabRatio, setJabRatio] = useState(defaultRatio);
  const [platform, setPlatform] = useState("reels");
  const [lengthSec, setLengthSec] = useState(30);
  const [cadenceDays, setCadenceDays] = useState(1);
  const [topic, setTopic] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: CreatedItem[]; errors: string[] } | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/super-admin/content-engine/api/generate/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, jabRatio, platform, lengthSec, cadenceDays, topic }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Batch failed.");
        return;
      }
      setResult({ created: json.created ?? [], errors: json.errors ?? [] });
    } catch {
      setError("Couldn't reach the generator. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const jabs = result?.created.filter((c) => c.type === "JAB").length ?? 0;
  const hooks = result?.created.filter((c) => c.type === "RIGHT_HOOK").length ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px,1fr]">
      <div className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-5">
        {!enabled && (
          <div className="rounded-lg border border-mango/40 bg-mango/10 p-3 text-sm text-plum-ink">
            The Claude API key isn&apos;t set on the server, so generation is disabled.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-plum-ink/45">
              How many posts
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-plum-ink/45">
              Jabs : 1 hook
            </label>
            <input
              type="number"
              min={1}
              max={6}
              value={jabRatio}
              onChange={(e) => setJabRatio(Number(e.target.value))}
              className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-plum-ink/45">
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-plum-ink/45">
              Length
            </label>
            <select
              value={lengthSec}
              onChange={(e) => setLengthSec(Number(e.target.value))}
              className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            >
              {LENGTHS.map((l) => (
                <option key={l} value={l}>
                  {l}s
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-plum-ink/45">
            Post every (days)
          </label>
          <input
            type="number"
            min={1}
            max={7}
            value={cadenceDays}
            onChange={(e) => setCadenceDays(Number(e.target.value))}
            className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-plum-ink/45">
            Theme / angle (optional)
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="e.g. peak-hour speed week"
            className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={run}
          disabled={loading || !enabled}
          className="w-full rounded-full bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? `Generating ${count}…` : `Generate ${count} & schedule`}
        </button>
        {error && <p className="text-sm text-guava">{error}</p>}
        <p className="text-xs text-plum-ink/45">
          Uses the cheaper batch model. Posts are saved to the calendar starting tomorrow.
        </p>
      </div>

      <div>
        {result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-mango/15 px-3 py-1 font-semibold text-mango">
                {result.created.length} scheduled
              </span>
              <span className="rounded-full bg-sky-500/15 px-3 py-1 font-semibold text-sky-700">
                {jabs} jabs
              </span>
              <span className="rounded-full bg-brand-primary/15 px-3 py-1 font-semibold text-brand-primary">
                {hooks} hooks
              </span>
              <a href="/super-admin/content-engine/calendar" className="ml-auto text-sm font-semibold text-brand-primary">
                Open calendar →
              </a>
            </div>

            <div className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="text-plum-ink/50">
                  <tr className="border-b border-plum-ink/10">
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Pillar</th>
                    <th className="px-3 py-2">Title</th>
                  </tr>
                </thead>
                <tbody>
                  {result.created.map((c) => (
                    <tr key={c.id} className="border-t border-plum-ink/5">
                      <td className="whitespace-nowrap px-3 py-2 text-plum-ink/60">{fmtDay(c.scheduledFor)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            c.type === "JAB" ? "bg-sky-500/15 text-sky-700" : "bg-brand-primary/15 text-brand-primary"
                          }`}
                        >
                          {c.type === "JAB" ? "Jab" : "Hook"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-plum-ink/60">{c.pillar ?? "—"}</td>
                      <td className="px-3 py-2 font-medium">{c.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-tile border border-guava/30 bg-guava/5 p-3 text-sm text-plum-ink/70">
                <p className="font-semibold text-guava">{result.errors.length} couldn&apos;t generate:</p>
                <ul className="mt-1 list-disc pl-5">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-tile border border-dashed border-plum-ink/15 bg-white p-8 text-center text-sm text-plum-ink/45">
            Set a count and ratio, then generate a week of content in one go. Each post lands on the
            calendar.
          </div>
        )}
      </div>
    </div>
  );
}
