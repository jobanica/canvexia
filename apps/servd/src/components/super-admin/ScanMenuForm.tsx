"use client";

import { useActionState } from "react";
import { scanDemoMenu, type ScanState } from "@/server/storefront-demo/actions";

export function ScanMenuForm({ restaurantId }: { restaurantId: string }) {
  const [state, action, pending] = useActionState<ScanState, FormData>(scanDemoMenu, null);
  return (
    <form action={action} className="rounded-tile border border-brand-primary/25 bg-brand-primary/5 p-4">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <p className="font-heading font-bold text-plum-ink">✨ Scan a menu (photo or PDF)</p>
      <p className="text-xs text-plum-ink/55">
        Upload a photo or PDF of their printed menu — AI reads it and fills in the categories &amp;
        items for you (you can edit after). JPEG / PNG / WebP / PDF, up to 4 files.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input name="images" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="text-xs" />
        <button
          disabled={pending}
          className="rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Scanning…" : "Scan & autofill"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && (
        <p className="mt-2 text-sm text-mango">
          Added {state.added} item{state.added === 1 ? "" : "s"} from the photo — review &amp; tidy them below.
        </p>
      )}
    </form>
  );
}
