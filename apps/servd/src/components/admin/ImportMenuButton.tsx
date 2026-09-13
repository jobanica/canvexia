"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createMenuImportUploads,
  analyzeMenuMedia,
  importParsedMenu,
  type ParsedCategory,
  type CreatedItem,
} from "@/server/menu/ai-import";
import { generateItemImage } from "@/server/menu/item-images";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Generate a few photos at a time — fast enough, gentle on rate limits.
const PHOTO_CONCURRENCY = 2;

// Client-side guards (the server re-checks types). Photos are downscaled first,
// so the real cap that matters is the PDF size.
const MAX_PDF_MB = 32;
const MAX_FILES = 6;

/** Editable draft mirrors ParsedCategory but keeps prices as strings for inputs. */
type DraftItem = { name: string; description: string; price: string };
type DraftCategory = { name: string; items: DraftItem[] };

/**
 * Shrink a photo in the browser before upload. Phone photos are often 3–8 MB,
 * which exceeds the serverless request-body limit — a menu resized to ~1800px
 * stays sharp enough for the model while dropping to a few hundred KB. PDFs and
 * anything that can't be decoded are passed through untouched.
 */
async function downscaleImage(file: File, maxDim = 1800, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // fall back to the original on any decode/canvas failure
  }
}

function toDraft(categories: ParsedCategory[]): DraftCategory[] {
  return categories.map((c) => ({
    name: c.name,
    items: c.items.map((i) => ({
      name: i.name,
      description: i.description ?? "",
      price: i.price ? String(i.price) : "",
    })),
  }));
}

export function ImportMenuButton({ imageGenEnabled = false }: { imageGenEnabled?: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelPhotos = useRef(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<
    "upload" | "analyzing" | "review" | "importing" | "photos"
  >("upload");
  const [draft, setDraft] = useState<DraftCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ categories: number; items: number; photos?: number } | null>(
    null,
  );
  const [autoDescribe, setAutoDescribe] = useState(true);
  const [genPhotos, setGenPhotos] = useState(false);
  const [photoProgress, setPhotoProgress] = useState({ done: 0, total: 0, failed: 0 });

  function reset() {
    setStep("upload");
    setDraft([]);
    setError(null);
    setDone(null);
    setGenPhotos(false);
    setPhotoProgress({ done: 0, total: 0, failed: 0 });
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    cancelPhotos.current = true; // stop any in-flight photo generation
    setOpen(false);
    reset();
  }

  async function analyze() {
    const picked = fileRef.current?.files;
    if (!picked || picked.length === 0) {
      setError("Choose at least one menu photo or PDF.");
      return;
    }
    if (picked.length > MAX_FILES) {
      setError(`Please choose at most ${MAX_FILES} files.`);
      return;
    }
    for (const f of Array.from(picked)) {
      if (f.type === "application/pdf" && f.size > MAX_PDF_MB * 1024 * 1024) {
        setError(`Each PDF must be ${MAX_PDF_MB} MB or smaller.`);
        return;
      }
    }

    setError(null);
    setStep("analyzing");

    try {
      // Downscale photos in the browser; leave PDFs as-is.
      const files = await Promise.all(Array.from(picked).map((f) => downscaleImage(f)));

      // 1. Ask the server for signed upload URLs.
      const prep = await createMenuImportUploads(files.map((f) => f.type));
      if (!prep.ok) {
        setError(prep.error);
        setStep("upload");
        return;
      }

      // 2. Upload each file straight to Supabase Storage (bypasses the
      //    serverless body limit, so big PDFs work).
      const supabase = createSupabaseBrowserClient();
      await Promise.all(
        files.map(async (file, i) => {
          const t = prep.targets[i];
          const { error } = await supabase.storage
            .from(prep.bucket)
            .uploadToSignedUrl(t.path, t.token, file);
          if (error) throw error;
        }),
      );

      // 3. Analyze from storage.
      const res = await analyzeMenuMedia({
        paths: prep.targets.map((t) => t.path),
        generateDescriptions: autoDescribe,
      });
      if (!res.ok) {
        setError(res.error);
        setStep("upload");
        return;
      }
      setDraft(toDraft(res.categories));
      setStep("review");
    } catch (e) {
      const detail = e instanceof Error && e.message ? `: ${e.message}` : "";
      setError(`Upload failed${detail}. Please try again.`);
      setStep("upload");
    }
  }

  const itemCount = draft.reduce((n, c) => n + c.items.length, 0);

  async function doImport() {
    setError(null);
    setStep("importing");
    const payload = {
      categories: draft
        .map((c) => ({
          name: c.name.trim(),
          items: c.items
            .filter((i) => i.name.trim())
            .map((i) => ({
              name: i.name.trim(),
              description: i.description.trim(),
              price: Number(i.price) || 0,
            })),
        }))
        .filter((c) => c.name && c.items.length > 0),
    };
    if (payload.categories.length === 0) {
      setError("Nothing to import — add at least one item.");
      setStep("review");
      return;
    }
    try {
      const res = await importParsedMenu(payload);
      if (!res.ok) {
        setError(res.error);
        setStep("review");
        return;
      }
      if (imageGenEnabled && genPhotos && res.created.length > 0) {
        await runPhotoGeneration(res.created, res.categories);
      } else {
        setDone({ categories: res.categories, items: res.items });
        router.refresh();
      }
    } catch {
      setError("Couldn't save the menu — please try again.");
      setStep("review");
    }
  }

  // Generate AI photos for the freshly imported items, a couple at a time.
  async function runPhotoGeneration(items: CreatedItem[], categories: number) {
    setStep("photos");
    cancelPhotos.current = false;
    setPhotoProgress({ done: 0, total: items.length, failed: 0 });

    let done = 0;
    let failed = 0;
    const queue = [...items];

    async function worker() {
      while (queue.length > 0 && !cancelPhotos.current) {
        const item = queue.shift();
        if (!item) break;
        try {
          const r = await generateItemImage(item.id);
          if (!r.ok) failed++;
        } catch {
          failed++;
        }
        done++;
        setPhotoProgress({ done, total: items.length, failed });
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(PHOTO_CONCURRENCY, items.length) }, () => worker()),
    );

    router.refresh();
    setDone({ categories, items: items.length, photos: done - failed });
  }

  // --- draft editing helpers ---
  function updateCategory(ci: number, name: string) {
    setDraft((d) => d.map((c, i) => (i === ci ? { ...c, name } : c)));
  }
  function removeCategory(ci: number) {
    setDraft((d) => d.filter((_, i) => i !== ci));
  }
  function updateItem(ci: number, ii: number, patch: Partial<DraftItem>) {
    setDraft((d) =>
      d.map((c, i) =>
        i === ci ? { ...c, items: c.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : c,
      ),
    );
  }
  function removeItem(ci: number, ii: number) {
    setDraft((d) =>
      d.map((c, i) => (i === ci ? { ...c, items: c.items.filter((_, j) => j !== ii) } : c)),
    );
  }

  const input =
    "rounded-lg border border-plum-ink/15 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full px-4 py-2 text-sm font-semibold btn-brand"
      >
        ✨ Import from photo
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-6 w-full max-w-2xl rounded-tile bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">Import menu from a photo</h2>
              <button onClick={close} className="text-sm font-semibold text-plum-ink/50">
                Close
              </button>
            </div>

            {/* Success */}
            {done ? (
              <div className="py-8 text-center">
                <p className="text-4xl">✅</p>
                <p className="mt-3 font-semibold">
                  Added {done.items} item{done.items === 1 ? "" : "s"}
                  {done.categories > 0 &&
                    ` across ${done.categories} new categor${done.categories === 1 ? "y" : "ies"}`}
                  .
                </p>
                {done.photos !== undefined && (
                  <p className="mt-1 text-sm text-plum-ink/55">
                    🎨 Generated {done.photos} photo{done.photos === 1 ? "" : "s"}.
                  </p>
                )}
                <p className="mt-1 text-sm text-plum-ink/55">
                  Review them below in your menu — tweak photos, costs, and modifiers anytime.
                </p>
                <button
                  onClick={close}
                  className="mt-5 rounded-full px-5 py-2.5 text-sm font-semibold btn-brand"
                >
                  Done
                </button>
              </div>
            ) : step === "photos" ? (
              /* Generating photos */
              <div className="py-8 text-center">
                <p className="text-4xl">🎨</p>
                <p className="mt-3 font-semibold">
                  Generating photos… {photoProgress.done}/{photoProgress.total}
                </p>
                <div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full bg-cream">
                  <div
                    className="h-full bg-brand-gradient transition-all"
                    style={{
                      width: `${photoProgress.total ? (photoProgress.done / photoProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-plum-ink/45">
                  Your items are already saved — you can stop and keep the photos generated so far.
                </p>
                <button
                  onClick={() => {
                    cancelPhotos.current = true;
                  }}
                  className="mt-4 rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
                >
                  Stop
                </button>
              </div>
            ) : step === "review" ? (
              /* Editable review */
              <>
                <p className="mt-1 text-sm text-plum-ink/55">
                  Check the prices and names below — fix anything the scan got wrong, then import.
                  Items already on your menu are skipped.
                </p>

                <div className="mt-4 max-h-[55vh] space-y-5 overflow-y-auto pr-1">
                  {draft.map((cat, ci) => (
                    <div key={ci} className="rounded-lg border border-plum-ink/10 p-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={cat.name}
                          onChange={(e) => updateCategory(ci, e.target.value)}
                          placeholder="Category name"
                          className={`flex-1 font-heading font-bold ${input}`}
                        />
                        <button
                          onClick={() => removeCategory(ci)}
                          className="text-xs font-semibold text-muted hover:text-guava"
                        >
                          Remove
                        </button>
                      </div>

                      <ul className="mt-3 space-y-2">
                        {cat.items.map((item, ii) => (
                          <li key={ii} className="flex flex-wrap items-start gap-2">
                            <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                              <input
                                value={item.name}
                                onChange={(e) => updateItem(ci, ii, { name: e.target.value })}
                                placeholder="Item name"
                                className={input}
                              />
                              <input
                                value={item.description}
                                onChange={(e) =>
                                  updateItem(ci, ii, { description: e.target.value })
                                }
                                placeholder="Description (optional)"
                                className={`${input} text-plum-ink/70`}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-plum-ink/50">₱</span>
                              <input
                                value={item.price}
                                inputMode="decimal"
                                onChange={(e) => updateItem(ci, ii, { price: e.target.value })}
                                placeholder="0"
                                className={`w-24 ${input}`}
                              />
                            </div>
                            <button
                              onClick={() => removeItem(ci, ii)}
                              aria-label="Remove item"
                              className="px-1 py-2 text-muted hover:text-guava"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {error && <p className="mt-3 text-sm text-guava">{error}</p>}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    onClick={reset}
                    className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
                  >
                    Start over
                  </button>
                  <button
                    onClick={doImport}
                    disabled={itemCount === 0}
                    className="rounded-full px-5 py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
                  >
                    Import {itemCount} item{itemCount === 1 ? "" : "s"}
                  </button>
                </div>
              </>
            ) : (
              /* Upload */
              <>
                <p className="mt-1 text-sm text-plum-ink/55">
                  Upload a clear photo or PDF of your printed menu. Claude reads it, sorts items
                  into categories, and drafts everything — you review before anything is saved.
                </p>

                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-tile border-2 border-dashed border-plum-ink/20 px-4 py-10 text-center hover:border-brand-primary/50">
                  <span className="text-3xl">📷</span>
                  <span className="text-sm font-semibold">Choose menu photo(s) or PDF</span>
                  <span className="text-xs text-plum-ink/45">
                    JPG, PNG, WebP, or PDF · up to 6 files
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    multiple
                    className="hidden"
                    onChange={() => setError(null)}
                  />
                </label>

                <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-plum-ink/70">
                  <input
                    type="checkbox"
                    checked={autoDescribe}
                    onChange={(e) => setAutoDescribe(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand-primary"
                  />
                  <span>
                    <span className="font-semibold">Auto-write descriptions</span> for items that
                    don&apos;t have one. You can still edit them before importing.
                  </span>
                </label>

                {imageGenEnabled && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm text-plum-ink/70">
                    <input
                      type="checkbox"
                      checked={genPhotos}
                      onChange={(e) => setGenPhotos(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-brand-primary"
                    />
                    <span>
                      <span className="font-semibold">Generate AI photos</span> for each item (a
                      few cents each, takes a moment). Generic placeholder shots — swap your own
                      anytime.
                    </span>
                  </label>
                )}

                {error && <p className="mt-3 text-sm text-guava">{error}</p>}

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={analyze}
                    disabled={step === "analyzing"}
                    className="rounded-full px-5 py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
                  >
                    {step === "analyzing" ? "Reading menu…" : "Analyze"}
                  </button>
                </div>
              </>
            )}

            {step === "importing" && (
              <p className="mt-3 text-center text-sm text-plum-ink/55">Saving to your menu…</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
