"use client";

import { useState } from "react";
import { renameCategory, deleteCategory } from "@/server/menu/actions";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";

/**
 * Category card header: shows the name with an inline "Edit" (rename) toggle
 * and the "Delete category" action. Rename calls the existing renameCategory
 * server action, which revalidates the page so the new name shows immediately.
 */
export function CategoryHeader({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

  function cancel() {
    setEditing(false);
    setValue(name);
  }

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      cancel();
      return;
    }
    setSaving(true);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("name", trimmed);
    await renameCategory(fd);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-1 items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              cancel();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-1 font-heading text-lg font-bold"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
        <button type="button" onClick={cancel} className="text-xs text-muted hover:text-plum-ink">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-lg font-bold">{name}</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted hover:text-brand-primary"
        >
          Edit
        </button>
      </div>
      <form action={deleteCategory}>
        <input type="hidden" name="id" value={id} />
        <ConfirmSubmitButton
          confirmText={`Delete the "${name}" category and ALL its items? This can't be undone.`}
          className="text-xs text-muted hover:text-guava"
        >
          Delete category
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}
