"use client";

import { useState } from "react";
import { saveTutorials } from "@/server/tutorials/actions";
import type { TutorialsData, TutorialSection, TutorialVideo } from "@/server/tutorials/tutorials";

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

// Small helper to move an array item up (-1) or down (+1) immutably.
function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function TutorialsEditor({
  initial,
  publicUrl,
}: {
  initial: TutorialsData;
  publicUrl: string;
}) {
  const [intro, setIntro] = useState(initial.intro);
  const [sections, setSections] = useState<TutorialSection[]>(initial.sections);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function markDirty() {
    setSavedAt(null);
    setError(null);
  }

  // ---- Section ops ----
  function addSection() {
    markDirty();
    setSections((s) => [...s, { id: uid(), title: "", videos: [] }]);
  }
  function updateSection(id: string, patch: Partial<TutorialSection>) {
    markDirty();
    setSections((s) => s.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec)));
  }
  function removeSection(id: string) {
    if (!confirm("Delete this whole section and its videos?")) return;
    markDirty();
    setSections((s) => s.filter((sec) => sec.id !== id));
  }
  function moveSection(i: number, dir: -1 | 1) {
    markDirty();
    setSections((s) => move(s, i, dir));
  }

  // ---- Video ops ----
  function addVideo(secId: string) {
    markDirty();
    setSections((s) =>
      s.map((sec) =>
        sec.id === secId ? { ...sec, videos: [...sec.videos, { id: uid(), title: "", url: "" }] } : sec,
      ),
    );
  }
  function updateVideo(secId: string, vidId: string, patch: Partial<TutorialVideo>) {
    markDirty();
    setSections((s) =>
      s.map((sec) =>
        sec.id === secId
          ? { ...sec, videos: sec.videos.map((v) => (v.id === vidId ? { ...v, ...patch } : v)) }
          : sec,
      ),
    );
  }
  function removeVideo(secId: string, vidId: string) {
    markDirty();
    setSections((s) =>
      s.map((sec) => (sec.id === secId ? { ...sec, videos: sec.videos.filter((v) => v.id !== vidId) } : sec)),
    );
  }
  function moveVideo(secId: string, i: number, dir: -1 | 1) {
    markDirty();
    setSections((s) => s.map((sec) => (sec.id === secId ? { ...sec, videos: move(sec.videos, i, dir) } : sec)));
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    const res = await saveTutorials({ intro, sections });
    setSaving(false);
    if (res.ok) setSavedAt(new Date().toLocaleTimeString());
    else setError(res.error);
  }

  const totalVideos = sections.reduce((n, s) => n + s.videos.length, 0);

  return (
    <div className="space-y-6">
      {/* Save bar */}
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b border-plum-ink/10 bg-cream/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-full px-5 py-2 text-sm font-semibold btn-brand disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <a href={publicUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-primary underline">
          View public page ↗
        </a>
        <span className="text-xs text-plum-ink/50">
          {sections.length} section{sections.length === 1 ? "" : "s"} · {totalVideos} video{totalVideos === 1 ? "" : "s"}
        </span>
        {savedAt && <span className="text-xs font-semibold text-green-600">Saved {savedAt}</span>}
        {error && <span className="text-xs font-semibold text-guava">{error}</span>}
      </div>

      {/* Intro blurb */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <label className="text-sm font-semibold text-plum-ink">Intro text (optional)</label>
        <p className="mb-2 text-xs text-plum-ink/50">Shown under the title on the public tutorials page.</p>
        <textarea
          value={intro}
          onChange={(e) => {
            markDirty();
            setIntro(e.target.value);
          }}
          rows={2}
          maxLength={500}
          placeholder="Everything you need to set up and run your store on Servd."
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
      </div>

      {/* Sections */}
      {sections.map((sec, si) => (
        <div key={sec.id} className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <div className="flex items-start gap-2">
            <input
              value={sec.title}
              onChange={(e) => updateSection(sec.id, { title: e.target.value })}
              placeholder={`Section title (e.g. "Getting started")`}
              className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm font-semibold"
            />
            <button type="button" onClick={() => moveSection(si, -1)} disabled={si === 0} className="rounded-lg border border-plum-ink/15 px-2.5 py-2 text-sm disabled:opacity-30" aria-label="Move section up">↑</button>
            <button type="button" onClick={() => moveSection(si, 1)} disabled={si === sections.length - 1} className="rounded-lg border border-plum-ink/15 px-2.5 py-2 text-sm disabled:opacity-30" aria-label="Move section down">↓</button>
            <button type="button" onClick={() => removeSection(sec.id)} className="rounded-lg border border-guava/40 px-2.5 py-2 text-sm text-guava" aria-label="Delete section">✕</button>
          </div>

          {/* Videos */}
          <div className="mt-4 space-y-3">
            {sec.videos.map((v, vi) => (
              <div key={v.id} className="rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-plum-ink/40">#{vi + 1}</span>
                  <input
                    value={v.title}
                    onChange={(e) => updateVideo(sec.id, v.id, { title: e.target.value })}
                    placeholder="Video title (e.g. How to add a menu item)"
                    className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                  />
                  <button type="button" onClick={() => moveVideo(sec.id, vi, -1)} disabled={vi === 0} className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-xs disabled:opacity-30" aria-label="Move video up">↑</button>
                  <button type="button" onClick={() => moveVideo(sec.id, vi, 1)} disabled={vi === sec.videos.length - 1} className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-xs disabled:opacity-30" aria-label="Move video down">↓</button>
                  <button type="button" onClick={() => removeVideo(sec.id, v.id)} className="rounded-lg border border-guava/40 px-2 py-1.5 text-xs text-guava" aria-label="Delete video">✕</button>
                </div>
                <input
                  value={v.url}
                  onChange={(e) => updateVideo(sec.id, v.id, { url: e.target.value })}
                  placeholder="YouTube link (e.g. https://youtu.be/xxxxxxxxxxx)"
                  className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
                <input
                  value={v.description ?? ""}
                  onChange={(e) => updateVideo(sec.id, v.id, { description: e.target.value })}
                  placeholder="Short description (optional)"
                  className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => addVideo(sec.id)}
              className="rounded-full border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary"
            >
              + Add video
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addSection}
        className="w-full rounded-tile border-2 border-dashed border-plum-ink/20 px-4 py-4 text-sm font-semibold text-plum-ink/60 hover:border-brand-primary hover:text-brand-primary"
      >
        + Add section
      </button>
    </div>
  );
}
