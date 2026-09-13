"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Reorderable list with two input methods so it works everywhere:
 *  - drag the ⠿ handle (desktop / mouse), and
 *  - ▲ / ▼ buttons (touch / mobile, where native HTML5 drag doesn't fire).
 * On each change it optimistically reorders locally and calls the server action
 * `onReorder` with the new id order (which persists sortOrder + revalidates).
 */
export function SortableList({
  entries,
  onReorder,
  className,
  itemClassName,
}: {
  entries: { id: string; node: ReactNode }[];
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  className?: string;
  itemClassName?: string;
}) {
  const [order, setOrder] = useState(entries.map((e) => e.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Re-sync when the server list changes (item/category added, removed, or the
  // saved order comes back) — keyed on the id signature.
  const sig = entries.map((e) => e.id).join(",");
  useEffect(() => setOrder(entries.map((e) => e.id)), [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(entries.map((e) => [e.id, e.node]));

  function commit(next: string[]) {
    setOrder(next);
    setDragId(null);
    setOverId(null);
    void onReorder(next);
  }
  function move(id: string, dir: -1 | 1) {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }
  function drop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setOverId(null);
      return;
    }
    const next = [...order];
    next.splice(next.indexOf(dragId), 1);
    next.splice(next.indexOf(targetId), 0, dragId);
    commit(next);
  }

  return (
    <div className={className}>
      {order.map((id, idx) => (
        <div
          key={id}
          onDragOver={(e) => {
            if (!dragId) return; // only react to drags from THIS list
            e.preventDefault();
            e.stopPropagation();
            setOverId(id);
          }}
          onDrop={(e) => {
            if (!dragId) return;
            e.stopPropagation();
            drop(id);
          }}
          className={`flex items-stretch gap-2 rounded-tile ${
            overId === id && dragId && dragId !== id ? "ring-2 ring-brand-primary/50" : ""
          } ${itemClassName ?? ""}`}
        >
          <div className="flex flex-col items-center justify-center gap-0.5 py-1 text-plum-ink/40">
            <button
              type="button"
              onClick={() => move(id, -1)}
              disabled={idx === 0}
              className="leading-none hover:text-plum-ink disabled:opacity-25"
              aria-label="Move up"
            >
              ▲
            </button>
            <span
              draggable
              onDragStart={() => setDragId(id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className="cursor-grab select-none text-lg leading-none text-plum-ink/30 active:cursor-grabbing"
              title="Drag to reorder"
            >
              ⠿
            </span>
            <button
              type="button"
              onClick={() => move(id, 1)}
              disabled={idx === order.length - 1}
              className="leading-none hover:text-plum-ink disabled:opacity-25"
              aria-label="Move down"
            >
              ▼
            </button>
          </div>
          <div className="min-w-0 flex-1">{byId.get(id)}</div>
        </div>
      ))}
    </div>
  );
}
