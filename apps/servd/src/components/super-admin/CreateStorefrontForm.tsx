"use client";

import { useActionState, useState } from "react";
import { createDemoStorefront, type FormState } from "@/server/storefront-demo/actions";

/** 4 MB, matching what the uploader accepts server-side. */
const MAX_MB = 4;

/**
 * A picked file, previewed before it's sent.
 *
 * The whole point of this form is that the prospect opens a link and sees their
 * own branding, so the person building it should be able to see the picture
 * they chose before creating anything — an upload you can't check is how a
 * sideways photo reaches a customer.
 */
function ImagePicker({
  name,
  label,
  hint,
  aspect,
}: {
  name: string;
  label: string;
  hint: string;
  aspect: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState(false);

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-plum-ink/55">{label}</label>
      <div className="flex items-start gap-3">
        <div className={`${aspect} shrink-0 overflow-hidden rounded-lg border border-plum-ink/10 bg-cream`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] text-plum-ink/40">
              none
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            name={name}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              // Release the previous blob before replacing it; picking through
              // several photos otherwise holds every one of them in memory.
              setPreview((old) => {
                if (old) URL.revokeObjectURL(old);
                return file ? URL.createObjectURL(file) : null;
              });
              // Warn here as well as server-side. The upload happens after the
              // storefront is created, so catching it now saves them arriving
              // at a finished demo with a missing picture.
              setTooBig(!!file && file.size > MAX_MB * 1024 * 1024);
            }}
          />
          <p className="mt-1 text-[11px] text-plum-ink/40">{hint}</p>
          {tooBig && (
            <p className="mt-1 text-[11px] font-semibold text-guava">
              That file is over {MAX_MB} MB and won&apos;t upload — pick a smaller one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function CreateStorefrontForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createDemoStorefront, null);
  const field = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <form action={action} className="grid gap-3 rounded-tile border border-plum-ink/10 bg-white p-4 sm:grid-cols-2">
      <input name="name" required placeholder="Business name *" className={field} />
      <input name="phone" placeholder="Phone (optional)" className={field} />
      <input name="address" placeholder="Address (optional)" className={`sm:col-span-2 ${field}`} />
      <input name="tagline" placeholder="Tagline (optional) — e.g. Davao's best BBQ" className={field} />

      <ImagePicker
        name="logo"
        label="Business logo"
        aspect="h-16 w-16"
        hint="Square works best. JPEG, PNG or WebP, up to 4 MB."
      />
      <ImagePicker
        name="cover"
        label="Cover photo"
        aspect="h-16 w-28"
        hint="Wide shot of the food or the shop — around 1200×600. This is the banner at the top of their site, and the picture that shows when you send the link."
      />

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          disabled={pending}
          className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create storefront"}
        </button>
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
      </div>
    </form>
  );
}
