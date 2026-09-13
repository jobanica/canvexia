"use client";

import { useActionState } from "react";
import { updateBranding, type FormState } from "@/server/branding/actions";
import { SubmitButton } from "./SubmitButton";

type Initial = {
  displayName: string;
  tagline: string;
  brandPrimaryColor: string;
  brandAccentColor: string;
  logoUrl: string | null;
};

const DEFAULT_PRIMARY = "#FF7A1A";
const DEFAULT_ACCENT = "#FF4D6D";

export function BrandingForm({ initial }: { initial: Initial }) {
  const [state, action] = useActionState<FormState, FormData>(
    updateBranding,
    null,
  );

  return (
    <form
      action={action}
      className="max-w-xl space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5"
    >
      <div className="flex items-center gap-4">
        {initial.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={initial.logoUrl} alt="Logo" className="h-16 w-16 rounded-xl object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-xl bg-brand-gradient" />
        )}
        <label className="text-sm">
          <span className="mr-2 text-plum-ink/60">Logo</span>
          <input type="file" name="logo" accept="image/jpeg,image/png,image/webp" className="text-xs" />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Display name</span>
        <input
          name="displayName"
          defaultValue={initial.displayName}
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Tagline</span>
        <input
          name="tagline"
          defaultValue={initial.tagline}
          placeholder="e.g. Home of the smoky burger"
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="font-medium">Primary color</span>
          <input
            name="brandPrimaryColor"
            type="color"
            defaultValue={initial.brandPrimaryColor || DEFAULT_PRIMARY}
            className="mt-1 h-10 w-full rounded-lg border border-plum-ink/15"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Accent color</span>
          <input
            name="brandAccentColor"
            type="color"
            defaultValue={initial.brandAccentColor || DEFAULT_ACCENT}
            className="mt-1 h-10 w-full rounded-lg border border-plum-ink/15"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Cover image</span>
        <input type="file" name="cover" accept="image/jpeg,image/png,image/webp" className="mt-1 block text-xs" />
      </label>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved. Your diner pages now use this branding.</p>}
      <SubmitButton>Save branding</SubmitButton>
    </form>
  );
}
