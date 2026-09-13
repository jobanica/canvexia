"use client";

import { useState } from "react";
import { scriptToMarkdown, scriptToTeleprompter, type GeneratedScript, type ScriptType } from "@/lib/content/script";

export interface ScriptCardData {
  id?: string;
  type: ScriptType;
  platform: string;
  lengthSec: number;
  pillar?: string | null;
  script: GeneratedScript;
}

/**
 * Renders a generated script: hook block, body table (time · action · line),
 * CTA block (hidden for jabs), production notes. Presentational — actions are
 * passed in by the parent.
 */
export function ScriptCard({
  data,
  onRegenerate,
  regenerating,
}: {
  data: ScriptCardData;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const [copied, setCopied] = useState<"md" | "tp" | null>(null);
  const isJab = data.type === "JAB";

  async function copy(key: "md" | "tp", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const markdown = () =>
    scriptToMarkdown(data.script, {
      type: data.type,
      platform: data.platform,
      lengthSec: data.lengthSec,
      pillar: data.pillar ?? undefined,
    });

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                isJab ? "bg-sky-500/15 text-sky-700" : "bg-brand-primary/15 text-brand-primary"
              }`}
            >
              {isJab ? "JAB — value, no ask" : "RIGHT HOOK — the ask"}
            </span>
            {data.pillar && (
              <span className="rounded-full bg-plum-ink/5 px-2.5 py-0.5 text-[11px] font-semibold text-plum-ink/55">
                {data.pillar}
              </span>
            )}
            <span className="text-[11px] text-plum-ink/45 capitalize">
              {data.platform} · {data.lengthSec}s
            </span>
          </div>
          <h3 className="font-heading text-lg font-bold">{data.script.title}</h3>
        </div>
        {data.id && (
          <span className="rounded-full bg-mango/15 px-2.5 py-0.5 text-[11px] font-semibold text-mango">
            Saved to library ✓
          </span>
        )}
      </div>

      {/* Hook */}
      <div className="mt-4 rounded-lg bg-cream/60 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">Hook · first 3s</p>
        <dl className="mt-1.5 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-plum-ink/60">Visual</dt>
            <dd>{data.script.hook.visual}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-plum-ink/60">Audio</dt>
            <dd>{data.script.hook.audio}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-plum-ink/60">Text overlay</dt>
            <dd className="font-medium">{data.script.hook.textOverlay}</dd>
          </div>
        </dl>
      </div>

      {/* Body */}
      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">Body</p>
        <div className="overflow-x-auto rounded-lg border border-plum-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr className="border-b border-plum-ink/10">
                <th className="px-3 py-1.5 font-semibold">Time</th>
                <th className="px-3 py-1.5 font-semibold">Action</th>
                <th className="px-3 py-1.5 font-semibold">Line</th>
              </tr>
            </thead>
            <tbody>
              {data.script.body.map((b, i) => (
                <tr key={i} className="border-t border-plum-ink/5 align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 text-plum-ink/60">{b.time}</td>
                  <td className="px-3 py-1.5 text-plum-ink/70">{b.action}</td>
                  <td className="px-3 py-1.5">{b.line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CTA — hidden for jabs */}
      {data.script.cta && (
        <div className="mt-4 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-primary/70">
            Call to action
          </p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-semibold text-plum-ink/60">Verbal</dt>
              <dd>{data.script.cta.verbal}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-semibold text-plum-ink/60">Text</dt>
              <dd className="font-medium">{data.script.cta.text}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-semibold text-plum-ink/60">Action</dt>
              <dd>{data.script.cta.action}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Production */}
      <div className="mt-4">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">
          Production notes
        </p>
        <p className="text-sm text-plum-ink/70">
          <span className="font-semibold">Music:</span> {data.script.production.music} ·{" "}
          <span className="font-semibold">B-roll:</span> {data.script.production.bRoll} ·{" "}
          <span className="font-semibold">Graphics:</span> {data.script.production.graphics}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => copy("tp", scriptToTeleprompter(data.script))}
          className="rounded-lg bg-plum-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          title="Copy just the spoken lines for your teleprompter"
        >
          {copied === "tp" ? "Copied ✓" : "📋 Copy script (teleprompter)"}
        </button>
        <button
          onClick={() => copy("md", markdown())}
          className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
        >
          {copied === "md" ? "Copied ✓" : "Copy as Markdown"}
        </button>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        )}
      </div>
    </div>
  );
}
