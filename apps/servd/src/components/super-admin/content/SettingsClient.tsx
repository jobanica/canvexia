"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBrandVoice, updatePillar, addPillar } from "@/server/content/actions";

interface Pillar {
  id: string;
  kind: "JAB" | "RIGHT_HOOK";
  name: string;
  description: string;
  active: boolean;
}

export function SettingsClient({
  systemPrompt,
  jabRatio,
  pillars,
}: {
  systemPrompt: string;
  jabRatio: number;
  pillars: Pillar[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  // Brand voice
  const [prompt, setPrompt] = useState(systemPrompt);
  const [ratio, setRatio] = useState(jabRatio);

  // New pillar
  const [newKind, setNewKind] = useState<"JAB" | "RIGHT_HOOK">("JAB");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, okMsg: string) {
    setNote(null);
    startTransition(async () => {
      const res = await fn();
      setNote(res.error ?? okMsg);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {note && <p className="text-sm text-brand-primary">{note}</p>}

      {/* Brand voice */}
      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Brand voice</h2>
        <p className="mb-3 text-sm text-plum-ink/50">
          This prompt IS the voice — editing it changes every generation, no code needed.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={16}
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 font-mono text-xs leading-relaxed"
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-plum-ink/70">
            Default jabs : 1 hook
            <input
              type="number"
              min={1}
              max={6}
              value={ratio}
              onChange={(e) => setRatio(Number(e.target.value))}
              className="w-16 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={() => run(() => updateBrandVoice(prompt, ratio), "Brand voice saved ✓")}
            disabled={pending}
            className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Save brand voice
          </button>
        </div>
      </section>

      {/* Pillars */}
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-bold">Pillars</h2>
        {(["JAB", "RIGHT_HOOK"] as const).map((kind) => (
          <div key={kind}>
            <p className={`mb-1.5 text-xs font-bold ${kind === "JAB" ? "text-sky-700" : "text-brand-primary"}`}>
              {kind === "JAB" ? "Jabs (value)" : "Right hooks (ask)"}
            </p>
            <div className="space-y-2">
              {pillars.filter((p) => p.kind === kind).map((p) => (
                <PillarRow key={p.id} pillar={p} onSaved={() => router.refresh()} />
              ))}
            </div>
          </div>
        ))}

        {/* Add pillar */}
        <div className="rounded-tile border border-dashed border-plum-ink/20 bg-white p-4">
          <p className="mb-2 text-sm font-semibold">Add a pillar</p>
          <div className="grid gap-2 sm:grid-cols-[140px,1fr]">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as "JAB" | "RIGHT_HOOK")}
              className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            >
              <option value="JAB">Jab</option>
              <option value="RIGHT_HOOK">Right hook</option>
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Pillar name"
              className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={2}
            placeholder="What this pillar is about (guides the model)"
            className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
          <button
            onClick={() =>
              run(async () => {
                const res = await addPillar({ kind: newKind, name: newName, description: newDesc });
                if (res.ok) {
                  setNewName("");
                  setNewDesc("");
                }
                return res;
              }, "Pillar added ✓")
            }
            disabled={pending}
            className="mt-2 rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold hover:bg-cream disabled:opacity-60"
          >
            Add pillar
          </button>
        </div>
      </section>
    </div>
  );
}

function PillarRow({ pillar, onSaved }: { pillar: Pillar; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(pillar.name);
  const [description, setDescription] = useState(pillar.description);

  function save(patch: { name?: string; description?: string; active?: boolean }) {
    startTransition(async () => {
      await updatePillar(pillar.id, patch);
      onSaved();
    });
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        pillar.active ? "border-plum-ink/10 bg-white" : "border-plum-ink/10 bg-plum-ink/5 opacity-70"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-plum-ink/15 px-2 py-1.5 text-sm font-medium"
        />
        <button
          onClick={() => save({ active: !pillar.active })}
          disabled={pending}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            pillar.active ? "bg-mango/15 text-mango" : "bg-plum-ink/10 text-plum-ink/60"
          }`}
        >
          {pillar.active ? "Active" : "Off"}
        </button>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="mt-2 w-full rounded-md border border-plum-ink/15 px-2 py-1.5 text-sm"
      />
      <button
        onClick={() => save({ name, description })}
        disabled={pending}
        className="mt-2 rounded-full bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        Save
      </button>
    </div>
  );
}
