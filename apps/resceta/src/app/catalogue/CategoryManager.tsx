"use client";

import { useActionState, useState } from "react";
import { saveCategory, removeCategory, moveCategory, type CategoryState } from "./category-actions";
import { Panel } from "./ImportPanel";
import type { CategoryDetail } from "@/server/pharmacy/categories";

const IDLE: CategoryState = { status: "idle" };
const FIELD = "rounded-lg border border-white/15 px-3 py-2 text-sm";

/**
 * Categories.
 *
 * The product form has offered a category dropdown since the vertical was
 * written, and until now there was no way to put anything in it — every
 * pharmacy saw an empty select and a column that could never be set.
 *
 * DELETING IS REFUSED WHILE PRODUCTS ARE IN IT. `categoryId` is SET NULL on
 * delete, so removing a category quietly un-files its products; that is a
 * surprise if you thought the category was empty. Move them somewhere first,
 * which is what the second form here is for.
 */
export function CategoryManager({
  categories,
  onClose,
}: {
  categories: CategoryDetail[];
  onClose: () => void;
}) {
  const [save, saveAction, saving] = useActionState(saveCategory, IDLE);
  const [remove, removeAction, removing] = useActionState(removeCategory, IDLE);
  const [move, moveAction, moving] = useActionState(moveCategory, IDLE);
  const [editing, setEditing] = useState<CategoryDetail | null>(null);
  const [movingFrom, setMovingFrom] = useState<CategoryDetail | null>(null);

  return (
    <Panel title="Categories" onClose={onClose}>
      <p className="text-sm text-slate-300">
        How the shelves are grouped. A product can sit in one — analgesics,
        antibiotics, the fridge — and the catalogue can then be filtered by it.
      </p>

      {/* Keyed so a finished save clears the box for the next one; the row
          appearing in the list below is the confirmation. */}
      <form
        key={editing ? `edit-${editing.id}` : `add-${categories.length}`}
        action={saveAction}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        {editing && <input type="hidden" name="categoryId" value={editing.id} />}
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={editing?.name ?? ""}
          placeholder={editing ? "New name" : "Add a category"}
          className={`${FIELD} min-w-0 flex-1`}
        />
        <button
          disabled={saving}
          className="brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Saving…" : editing ? "Rename" : "Add"}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-400 underline">
            Cancel
          </button>
        )}
      </form>
      {save.status === "error" && <p className="mt-2 text-sm text-red-300">{save.message}</p>}
      {save.status === "done" && <p className="mt-2 text-sm text-emerald-300">{save.message}</p>}

      {categories.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No categories yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-slate-400">
                {c.products} product{c.products === 1 ? "" : "s"}
              </span>
              <span className="ml-auto flex items-center gap-3">
                <button onClick={() => setEditing(c)} className="text-xs text-slate-400 underline">
                  Rename
                </button>
                {c.products > 0 ? (
                  <button
                    onClick={() => setMovingFrom(movingFrom?.id === c.id ? null : c)}
                    className="text-xs text-slate-400 underline"
                  >
                    Move products
                  </button>
                ) : (
                  // Only offered where it can succeed. The server refuses a
                  // non-empty category either way.
                  <form action={removeAction}>
                    <input type="hidden" name="categoryId" value={c.id} />
                    <button
                      disabled={removing}
                      className="text-xs text-slate-400 hover:text-red-300 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </span>

              {movingFrom?.id === c.id && (
                <form action={moveAction} className="flex w-full flex-wrap items-center gap-2 pt-2">
                  <input type="hidden" name="fromId" value={c.id} />
                  <span className="text-xs text-slate-400">Move all {c.products} to</span>
                  <select name="toId" defaultValue="" className={FIELD}>
                    <option value="">No category</option>
                    {categories
                      .filter((o) => o.id !== c.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                  <button
                    disabled={moving}
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    {moving ? "Moving…" : "Move"}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {remove.status === "error" && <p className="mt-2 text-sm text-red-300">{remove.message}</p>}
      {move.status === "error" && <p className="mt-2 text-sm text-red-300">{move.message}</p>}
      {move.status === "done" && <p className="mt-2 text-sm text-emerald-300">{move.message}</p>}
    </Panel>
  );
}
