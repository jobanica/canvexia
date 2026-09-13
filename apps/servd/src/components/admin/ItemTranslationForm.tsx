"use client";

import { useActionState } from "react";
import { upsertItemTranslation, type FormState } from "@/server/menu/translations";
import { SubmitButton } from "./SubmitButton";

export function ItemTranslationForm({
  menuItemId,
  locale,
  localeLabel,
  initial,
}: {
  menuItemId: string;
  locale: string;
  localeLabel: string;
  initial: { name: string; description: string };
}) {
  const [state, action] = useActionState<FormState, FormData>(
    upsertItemTranslation,
    null,
  );

  return (
    <form action={action} className="space-y-2 rounded-lg border border-plum-ink/10 p-3">
      <p className="text-sm font-semibold">{localeLabel}</p>
      <input type="hidden" name="menuItemId" value={menuItemId} />
      <input type="hidden" name="locale" value={locale} />
      <input
        name="name"
        defaultValue={initial.name}
        placeholder="Translated name (blank to clear)"
        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />
      <textarea
        name="description"
        defaultValue={initial.description}
        rows={2}
        placeholder="Translated description"
        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <SubmitButton className="px-3 py-1.5">Save {localeLabel}</SubmitButton>
        {state?.error && <span className="text-xs text-guava">{state.error}</span>}
        {state?.ok && <span className="text-xs text-mango">Saved.</span>}
      </div>
    </form>
  );
}
