"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveCrmSequence, resetCrmSequence } from "@/server/crm/actions";
import { TOTAL_TOUCHES, type SequenceStep } from "@/lib/crm/sequence";

interface Draft {
  step: number;
  key: string;
  label: string;
  waitDays: number;
  message: string;
  breakup: boolean;
}

function toDraft(s: SequenceStep): Draft {
  return {
    step: s.step,
    key: s.key,
    label: s.label,
    waitDays: s.waitDays,
    message: s.message,
    breakup: !!s.breakup,
  };
}

/**
 * Edit the cold-outreach follow-up messages. The owner can change the message
 * text, the touch label, and how many days to wait before each follow-up. The
 * initial message is always sent immediately (wait days locked to 0). Changes
 * apply to every client's future touches and to the "Send today" cards.
 */
export function CrmSequenceEditor({ sequence }: { sequence: SequenceStep[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(sequence.map(toDraft));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);

  function update(step: number, patch: Partial<Draft>) {
    setDrafts((d) => d.map((s) => (s.step === step ? { ...s, ...patch } : s)));
    setMsg(null);
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveCrmSequence(
        drafts.map((d) => ({
          step: d.step,
          label: d.label,
          waitDays: d.waitDays,
          message: d.message,
        })),
      );
      setMsg(res);
      if (res.ok) router.refresh();
    });
  }

  function reset() {
    if (!confirm("Reset all follow-up messages back to the Servd defaults?")) return;
    startTransition(async () => {
      const res = await resetCrmSequence();
      setMsg(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-tile border border-plum-ink/10 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span>
          <span className="font-heading text-lg font-bold">Follow-up messages</span>
          <span className="ml-2 text-sm text-plum-ink/50">
            Edit the {TOTAL_TOUCHES}-touch sequence ({TOTAL_TOUCHES - 1} follow-ups)
          </span>
        </span>
        <span className="text-plum-ink/40">{open ? "▲" : "▼ Edit"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-plum-ink/10 p-4">
          <p className="text-sm text-plum-ink/55">
            Use <code className="rounded bg-cream px-1">{"{name}"}</code> where you want the
            business name inserted. “Wait days” is how long to wait after the previous touch before
            this one is due.
          </p>

          {drafts.map((d) => (
            <div key={d.step} className="rounded-lg border border-plum-ink/10 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-plum-ink/5 px-2 py-0.5 text-[11px] font-semibold text-plum-ink/55">
                  Touch {d.step}/{TOTAL_TOUCHES}
                </span>
                {d.step === 1 && (
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    Initial message
                  </span>
                )}
                {d.breakup && (
                  <span className="rounded-full bg-guava/15 px-2 py-0.5 text-[11px] font-semibold text-guava">
                    Break-up
                  </span>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
                <input
                  value={d.label}
                  onChange={(e) => update(d.step, { label: e.target.value })}
                  placeholder="Touch label"
                  className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-plum-ink/60">
                  Wait
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={d.waitDays}
                    disabled={d.step === 1}
                    onChange={(e) => update(d.step, { waitDays: Number(e.target.value) })}
                    className="w-16 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm disabled:bg-plum-ink/5 disabled:text-plum-ink/40"
                  />
                  days
                </label>
              </div>

              <textarea
                value={d.message}
                onChange={(e) => update(d.step, { message: e.target.value })}
                rows={3}
                className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save messages"}
            </button>
            <button
              onClick={reset}
              disabled={pending}
              className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold text-plum-ink/60 hover:bg-cream disabled:opacity-60"
            >
              Reset to defaults
            </button>
            {msg?.ok && <span className="text-sm text-mango">Saved ✓</span>}
            {msg?.error && <span className="text-sm text-guava">{msg.error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
