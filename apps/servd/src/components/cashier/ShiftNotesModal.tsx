"use client";

import { useEffect, useState } from "react";
import { listShiftNotes, addShiftNote, type ShiftNoteRow } from "@/server/shifts/notes";

/** Read recent handover notes and leave one for the next shift. */
export function ShiftNotesModal({ onClose }: { onClose: () => void }) {
  const [notes, setNotes] = useState<ShiftNoteRow[] | "loading">("loading");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listShiftNotes()
      .then(setNotes)
      .catch(() => setNotes([]));
  }, []);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const res = await addShiftNote(body);
    setBusy(false);
    if (res.ok) {
      setBody("");
      if (res.notes) setNotes(res.notes);
    } else {
      setError(res.error ?? "Couldn't save.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5 shadow-xl sm:rounded-tile" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Shift handover notes</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Leave a note for the next shift… (e.g. fridge #2 acting up, 2 GCash refunds pending)"
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        {error && <p className="mt-1 text-sm text-guava">{error}</p>}
        <button
          onClick={add}
          disabled={busy || !body.trim()}
          className="mt-2 w-full rounded-full py-2.5 text-sm font-semibold text-white btn-brand disabled:opacity-60"
        >
          {busy ? "Saving…" : "Post note"}
        </button>

        <div className="mt-5 space-y-3">
          {notes === "loading" ? (
            <p className="text-center text-sm text-plum-ink/50">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="text-center text-sm text-plum-ink/50">No notes in the last few days.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-tile border border-plum-ink/10 p-3">
                <p className="whitespace-pre-wrap text-sm text-plum-ink">{n.body}</p>
                <p className="mt-1 text-xs text-plum-ink/45">
                  {n.authorName ?? "Staff"} · {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
