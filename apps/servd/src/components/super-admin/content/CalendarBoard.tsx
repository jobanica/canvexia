"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescheduleScript } from "@/server/content/actions";
import type { ScheduledScriptRow } from "@/server/content/queries";

/** Local yyyy-mm-dd key (timezone-stable for grouping by day). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CalendarBoard({
  scripts,
  days = 14,
}: {
  scripts: ScheduledScriptRow[];
  days?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const dayList = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, [days]);

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledScriptRow[]>();
    for (const s of scripts) {
      if (!s.scheduledFor) continue;
      const k = dayKey(new Date(s.scheduledFor));
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    }
    return map;
  }, [scripts]);

  const ratio = useMemo(() => {
    let jabs = 0;
    let hooks = 0;
    for (const s of scripts) {
      if (s.type === "JAB") jabs++;
      else hooks++;
    }
    return { jabs, hooks };
  }, [scripts]);

  // Pointer drag (mouse + touch), mirroring the CRM board.
  const dragMeta = useRef<{ id: string } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; title: string } | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  function dayUnder(x: number, y: number): string | null {
    const cell = document.elementFromPoint(x, y)?.closest("[data-day]");
    return cell?.getAttribute("data-day") ?? null;
  }
  function startDrag(e: React.PointerEvent, s: ScheduledScriptRow) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragMeta.current = { id: s.id };
    setDragging({ id: s.id, title: s.title });
    setGhost({ x: e.clientX, y: e.clientY });
  }
  function moveDrag(e: React.PointerEvent) {
    if (!dragMeta.current) return;
    setGhost({ x: e.clientX, y: e.clientY });
    setHoverDay(dayUnder(e.clientX, e.clientY));
  }
  function endDrag(e: React.PointerEvent) {
    const meta = dragMeta.current;
    dragMeta.current = null;
    setDragging(null);
    setHoverDay(null);
    if (!meta) return;
    const target = dayUnder(e.clientX, e.clientY);
    if (target) {
      startTransition(async () => {
        await rescheduleScript(meta.id, target);
        router.refresh();
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-sky-500/15 px-3 py-1 font-semibold text-sky-700">
          {ratio.jabs} jabs
        </span>
        <span className="rounded-full bg-brand-primary/15 px-3 py-1 font-semibold text-brand-primary">
          {ratio.hooks} hooks
        </span>
        <span className="text-plum-ink/45">
          {ratio.hooks > 0 ? `${(ratio.jabs / ratio.hooks).toFixed(1)} : 1 ratio` : "no hooks yet"}
        </span>
        {pending && <span className="text-plum-ink/45">saving…</span>}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {dayList.map((d) => {
          const k = dayKey(d);
          const items = byDay.get(k) ?? [];
          const hovered = hoverDay === k && !!dragging;
          const isToday = k === dayKey(new Date());
          return (
            <div
              key={k}
              data-day={k}
              className={`min-h-[96px] rounded-tile border bg-cream/40 p-2 transition ${
                hovered ? "border-brand-primary ring-2 ring-brand-primary/30" : "border-plum-ink/10"
              }`}
            >
              <p className={`mb-1.5 px-0.5 text-[11px] font-semibold ${isToday ? "text-brand-primary" : "text-plum-ink/45"}`}>
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </p>
              <div className="space-y-1.5">
                {items.map((s) => (
                  <div
                    key={s.id}
                    onPointerDown={(e) => startDrag(e, s)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    className={`cursor-grab touch-none select-none rounded-lg border p-1.5 text-[11px] leading-tight shadow-sm active:cursor-grabbing ${
                      s.type === "JAB"
                        ? "border-sky-500/20 bg-sky-500/10 text-sky-900"
                        : "border-brand-primary/25 bg-brand-primary/10 text-plum-ink"
                    } ${dragging?.id === s.id ? "opacity-40" : ""}`}
                    title={s.title}
                  >
                    <span className="font-bold">{s.type === "JAB" ? "JAB" : "HOOK"}</span>{" "}
                    <span className="line-clamp-2">{s.title}</span>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="px-0.5 py-3 text-center text-[10px] text-plum-ink/25">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-plum-ink/40">
        Drag a card onto another day to reschedule it. Blue = jab (value), orange = right hook (the
        ask) — eyeball the colour mix to keep your ratio healthy.
      </p>

      {dragging && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-brand-primary bg-white px-3 py-1.5 text-xs font-semibold shadow-xl"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {dragging.title}
        </div>
      )}
    </div>
  );
}
