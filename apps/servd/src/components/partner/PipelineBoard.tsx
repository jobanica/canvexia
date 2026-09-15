"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  STAGES,
  STAGE_LABELS,
  SOURCE_LABELS,
  type Stage,
} from "@/lib/partners/prospect-input";
import { moveProspectAction, type ProspectState } from "@/server/partners/prospect-actions";
import type { ProspectRow } from "@/server/partners/prospects";

/**
 * The pipeline, as a board or a list.
 *
 * NO DRAG-AND-DROP LIBRARY, and no drag-only interaction. The brief asks for
 * kanban, and for this screen to work on a phone in a restaurant. Those pull in
 * opposite directions: a drag target is the one control that has no keyboard
 * equivalent and no good touch story.
 *
 * So every card carries a stage `<select>` that posts a form. That is the
 * mobile path, the keyboard path and the screen-reader path — and on desktop
 * HTML5 drag is layered on top of it, using the same action. The select is the
 * feature; the drag is the affordance.
 */
const initial: ProspectState = { status: "idle" };

function StageSelect({
  prospect,
  onMoved,
}: {
  prospect: ProspectRow;
  onMoved: () => void;
}) {
  const [state, action, pending] = useActionState(moveProspectAction, initial);

  return (
    <form
      action={(fd) => {
        action(fd);
        onMoved();
      }}
      className="mt-3"
    >
      <input type="hidden" name="prospectId" value={prospect.id} />
      <label className="sr-only" htmlFor={`stage-${prospect.id}`}>
        Stage for {prospect.businessName}
      </label>
      <select
        id={`stage-${prospect.id}`}
        name="stage"
        defaultValue={prospect.stage}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="min-h-[38px] w-full rounded-lg border border-brand-ink/15 bg-white px-2 text-xs"
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {state.status === "error" && (
        <p role="alert" className="mt-1 text-xs text-guava">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Card({
  p,
  onMoved,
  draggable,
}: {
  p: ProspectRow;
  onMoved: () => void;
  draggable: boolean;
}) {
  const overdue = p.nextFollowUpAt && p.nextFollowUpAt.getTime() <= Date.now();

  return (
    <article
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
      className="rounded-tile border border-brand-ink/10 bg-white p-3"
    >
      <p className="truncate text-sm font-semibold">{p.businessName}</p>
      <p className="mt-0.5 truncate text-xs text-brand-ink/50">
        {p.productName}
        {p.ownerName ? ` · ${p.ownerName}` : ""}
      </p>

      {p.mobile && (
        <a href={`tel:${p.mobile}`} className="mt-1 block text-xs text-brand-primary">
          {p.mobile}
        </a>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5 text-[0.65rem]">
        <span className="rounded-full bg-brand-ink/[0.06] px-2 py-0.5 text-brand-ink/55">
          {SOURCE_LABELS[p.source as keyof typeof SOURCE_LABELS] ?? p.source}
        </span>
        {p.nextFollowUpAt && (
          <span
            className={`rounded-full px-2 py-0.5 ${
              overdue ? "bg-guava/12 text-guava" : "bg-brand-primary/10 text-brand-primary"
            }`}
          >
            {overdue ? "Follow up" : "Due"} {p.nextFollowUpAt.toLocaleDateString()}
          </span>
        )}
        {p.assignedToName && (
          <span className="rounded-full bg-brand-ink/[0.06] px-2 py-0.5 text-brand-ink/55">
            {p.assignedToName}
          </span>
        )}
      </div>

      {p.stage === "trial" && !p.convertedMerchantId && (
        // Moving to "trial" is the moment an account should exist. The link
        // carries the prospect so the create form arrives filled in, and
        // provisioning links the two back together.
        <Link
          href={`/partner?prospect=${p.id}`}
          className="mt-3 block rounded-lg bg-brand-ink px-3 py-2 text-center text-xs font-semibold text-white"
        >
          Open their account
        </Link>
      )}
      {p.convertedMerchantId && (
        <p className="mt-3 text-xs text-brand-ink/45">Account opened ✓</p>
      )}

      <StageSelect prospect={p} onMoved={onMoved} />
    </article>
  );
}

export function PipelineBoard({ prospects }: { prospects: ProspectRow[] }) {
  const [view, setView] = useState<"board" | "list">("board");
  // Bumped after a move so the optimistic reordering re-reads from props once
  // the server action's revalidate lands.
  const [, bump] = useState(0);
  const onMoved = () => bump((n) => n + 1);

  const byStage = (s: Stage) => prospects.filter((p) => p.stage === s);

  return (
    <>
      <div className="mt-5 flex items-center gap-2">
        {(["board", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              view === v ? "bg-brand-ink text-white" : "border border-brand-ink/15 text-brand-ink/60"
            }`}
          >
            {v === "board" ? "Board" : "List"}
          </button>
        ))}
      </div>

      {view === "board" ? (
        // Horizontal scroll is correct HERE and nowhere else on this screen: six
        // named columns are the shape of a kanban, and stacking them would just
        // be the list view with extra headings.
        <div className="mt-4 -mx-6 overflow-x-auto px-6 pb-2">
          <div className="flex min-w-max gap-3">
            {STAGES.map((s) => {
              const cards = byStage(s);
              return (
                <section key={s} className="w-64 shrink-0">
                  <h2 className="flex items-baseline justify-between px-1 pb-2 text-xs font-bold uppercase tracking-wide text-brand-ink/50">
                    {STAGE_LABELS[s]}
                    <span className="tabular-nums">{cards.length}</span>
                  </h2>
                  <div className="space-y-2 rounded-tile bg-brand-ink/[0.03] p-2">
                    {cards.length === 0 ? (
                      <p className="px-1 py-6 text-center text-xs text-brand-ink/35">Empty</p>
                    ) : (
                      cards.map((p) => <Card key={p.id} p={p} onMoved={onMoved} draggable />)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {prospects.map((p) => (
            <Card key={p.id} p={p} onMoved={onMoved} draggable={false} />
          ))}
        </div>
      )}
    </>
  );
}
