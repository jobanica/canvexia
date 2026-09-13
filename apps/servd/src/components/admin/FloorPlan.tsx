"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getFloorPlan,
  setTableStatus,
  setTablePosition,
  type FloorTable,
  type EffectiveStatus,
} from "@/server/tables/floor";

function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

const STATUS_STYLE: Record<EffectiveStatus, { ring: string; bg: string; label: string; dot: string }> = {
  empty: { ring: "ring-plum-ink/15", bg: "bg-white", label: "Available", dot: "bg-plum-ink/30" },
  occupied: { ring: "ring-brand-primary/40", bg: "bg-brand-primary/10", label: "Occupied", dot: "bg-brand-primary" },
  needs_cleaning: { ring: "ring-mango/50", bg: "bg-mango/15", label: "Needs cleaning", dot: "bg-mango" },
  reserved: { ring: "ring-guava/40", bg: "bg-guava/10", label: "Reserved", dot: "bg-guava" },
};

const TILE = 104; // px
const GAP = 16;

/** Default grid position for a table without a saved layout position. */
function defaultPos(index: number, cols: number) {
  return { x: (index % cols) * (TILE + GAP) + GAP, y: Math.floor(index / cols) * (TILE + GAP) + GAP };
}

export function FloorPlan({
  restaurantId,
  initialTables,
}: {
  restaurantId: string;
  initialTables: FloorTable[];
}) {
  const [tables, setTables] = useState<FloorTable[]>(initialTables);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  const cols = 5;

  // Positions: use saved pos, else lay out on a default grid.
  const positioned = tables.map((t, i) => ({
    ...t,
    _x: t.posX ?? defaultPos(i, cols).x,
    _y: t.posY ?? defaultPos(i, cols).y,
  }));

  const refresh = useCallback(async () => {
    try {
      setTables(await getFloorPlan(restaurantId));
    } catch {
      /* ignore */
    }
  }, [restaurantId]);

  // Live occupancy: refetch when orders change.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .subscribe();
    const poll = setInterval(refresh, 15000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  function onPointerDown(e: React.PointerEvent, t: { id: string; _x: number; _y: number }) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: t.id, dx: e.clientX - t._x, dy: e.clientY - t._y, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const maxX = (rect?.width ?? 600) - TILE;
    const maxY = (rect?.height ?? 400) - TILE;
    const x = Math.max(0, Math.min(maxX, e.clientX - d.dx));
    const y = Math.max(0, Math.min(maxY, e.clientY - d.dy));
    d.moved = true;
    setTables((prev) => prev.map((p) => (p.id === d.id ? { ...p, posX: Math.round(x), posY: Math.round(y) } : p)));
  }

  async function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setSelected((s) => (s === d.id ? null : d.id));
      return;
    }
    const t = tables.find((p) => p.id === d.id);
    if (t && t.posX != null && t.posY != null) {
      const res = await setTablePosition({ tableId: d.id, x: t.posX, y: t.posY });
      if (!res.ok) {
        setError(res.error ?? "Couldn't save the layout.");
        await refresh(); // snap back to the last saved positions
      } else {
        setError(null);
      }
    }
  }

  async function changeStatus(id: string, status: EffectiveStatus) {
    setBusy(true);
    const res = await setTableStatus(id, status);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't update the table.");
      return;
    }
    setError(null);
    setSelected(null);
    await refresh();
  }

  const rows = Math.ceil(tables.length / cols) || 1;
  const minHeight = Math.max(420, rows * (TILE + GAP) + GAP);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-plum-ink/60">
        {(Object.keys(STATUS_STYLE) as EffectiveStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[s].dot}`} />
            {STATUS_STYLE[s].label}
          </span>
        ))}
        <span className="text-plum-ink/40">· drag to arrange · tap a table for options</span>
      </div>

      {error && (
        <p className="rounded-lg border border-guava/30 bg-guava/10 px-3 py-2 text-sm text-guava">
          {error}
        </p>
      )}

      {tables.length === 0 ? (
        <p className="rounded-tile border border-plum-ink/10 bg-white p-6 text-sm text-plum-ink/50">
          No tables yet. Add tables first, then arrange them here.
        </p>
      ) : (
        <div
          ref={canvasRef}
          className="relative overflow-hidden rounded-tile border border-plum-ink/10 bg-[radial-gradient(circle,_rgba(0,0,0,0.05)_1px,_transparent_1px)] [background-size:24px_24px]"
          style={{ minHeight }}
        >
          {positioned.map((t) => {
            const st = STATUS_STYLE[t.status];
            return (
              <div
                key={t.id}
                onPointerDown={(e) => onPointerDown(e, t)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{ left: t._x, top: t._y, width: TILE, height: TILE }}
                className={`absolute flex cursor-grab touch-none select-none flex-col items-center justify-center rounded-2xl ring-2 ${st.ring} ${st.bg} shadow-sm active:cursor-grabbing`}
              >
                <span className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ${st.dot}`} />
                <span className="font-heading text-lg font-bold text-plum-ink">{t.tableNumber}</span>
                <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-plum-ink/45">
                  {st.label}
                </span>
                {t.openOrders > 0 && (
                  <span className="mt-1 text-xs font-bold text-brand-primary">{peso(t.outstanding)}</span>
                )}

                {selected === t.id && (
                  <div
                    className="absolute left-1/2 top-full z-20 mt-2 w-44 -translate-x-1/2 rounded-xl border border-plum-ink/10 bg-white p-2 shadow-xl"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <p className="px-1 pb-1 text-xs font-semibold text-plum-ink/50">
                      Table {t.tableNumber}
                      {t.openOrders > 0 && ` · ${t.openOrders} open`}
                    </p>
                    {(["empty", "needs_cleaning", "reserved"] as EffectiveStatus[]).map((s) => (
                      <button
                        key={s}
                        disabled={busy}
                        onClick={() => changeStatus(t.id, s)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-cream disabled:opacity-50"
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[s].dot}`} />
                        {s === "empty" ? "Mark available" : STATUS_STYLE[s].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
