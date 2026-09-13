"use client";

import { useMemo, useState } from "react";
import { ScriptCard, type ScriptCardData } from "./ScriptCard";
import type { ScriptType } from "@/lib/content/script";

interface Pillar {
  id: string;
  kind: ScriptType;
  name: string;
  active: boolean;
}

const PLATFORMS = [
  { value: "reels", label: "Reels" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
];

const LENGTHS = [15, 30, 45, 60, 90];

/**
 * Generate form → calls the super-admin-gated API → renders the resulting
 * ScriptCard. The API key never reaches here; this only POSTs the request.
 */
export function GenerateClient({ pillars, enabled }: { pillars: Pillar[]; enabled: boolean }) {
  const [type, setType] = useState<ScriptType>("JAB");
  const pillarsForType = useMemo(
    () => pillars.filter((p) => p.kind === type && p.active),
    [pillars, type],
  );
  const [pillarId, setPillarId] = useState<string>("");
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("reels");
  const [lengthSec, setLengthSec] = useState(30);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScriptCardData | null>(null);

  function pickType(t: ScriptType) {
    setType(t);
    setPillarId(""); // reset pillar — it's type-specific
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/super-admin/content-engine/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, pillarId: pillarId || undefined, topic, platform, lengthSec }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Generation failed.");
        return;
      }
      setResult(json as ScriptCardData);
    } catch {
      setError("Couldn't reach the generator. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
      {/* Form */}
      <div className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-5">
        {!enabled && (
          <div className="rounded-lg border border-mango/40 bg-mango/10 p-3 text-sm text-plum-ink">
            The Claude API key isn&apos;t set on the server, so generation is disabled. Add it to
            your environment to enable the Content Engine.
          </div>
        )}

        {/* Type */}
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-plum-ink/45">Type</p>
          <div className="inline-flex w-full rounded-full border border-plum-ink/15 p-0.5">
            {(["JAB", "RIGHT_HOOK"] as const).map((t) => (
              <button
                key={t}
                onClick={() => pickType(t)}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  type === t ? "bg-brand-gradient text-white" : "text-plum-ink/55"
                }`}
              >
                {t === "JAB" ? "Jab (value)" : "Right hook (ask)"}
              </button>
            ))}
          </div>
        </div>

        {/* Pillar */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-plum-ink/45">
            Pillar
          </label>
          <select
            value={pillarId}
            onChange={(e) => setPillarId(e.target.value)}
            className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          >
            <option value="">Let Claude pick a strong angle</option>
            {pillarsForType.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Topic */}
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-plum-ink/45">
            Topic / angle (optional)
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="e.g. 30% commission on a ₱100k month"
            className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>

        {/* Platform + length */}
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

        <button
          onClick={generate}
          disabled={loading || !enabled}
          className="w-full rounded-full bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Generating…" : "Generate script"}
        </button>
        {error && <p className="text-sm text-guava">{error}</p>}
      </div>

      {/* Result */}
      <div>
        {result ? (
          <ScriptCard data={result} onRegenerate={generate} regenerating={loading} />
        ) : (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-tile border border-dashed border-plum-ink/15 bg-white p-8 text-center text-sm text-plum-ink/45">
            Pick a type and pillar, then generate. Your script appears here and is saved to the
            library automatically.
          </div>
        )}
      </div>
    </div>
  );
}
