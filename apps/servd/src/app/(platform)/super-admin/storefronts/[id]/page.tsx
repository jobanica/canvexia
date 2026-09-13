import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoStorefront } from "@/server/storefront-demo/queries";
import {
  updateDemoDetails,
  addCategory,
  deleteCategory,
  addItem,
  deleteItem,
  toggleItem,
  uploadItemPhoto,
  setItemPhotoUrl,
  deleteDemoStorefront,
} from "@/server/storefront-demo/actions";
import { CopyLink } from "@/components/super-admin/CopyLink";
import { ScanMenuForm } from "@/components/super-admin/ScanMenuForm";
import { ConvertDemoForm } from "@/components/super-admin/ConvertDemoForm";
import { PreviewLoginPanel } from "@/components/super-admin/PreviewLoginPanel";
import { getPreviewLogin } from "@/server/storefront-demo/preview-login";
import { formatPeso } from "@/lib/money";
import { qrPngDataUrl } from "@/lib/qr";

export default async function StorefrontDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upload?: string }>;
}) {
  const { id } = await params;
  const s = await getDemoStorefront(id);
  if (!s) notFound();
  // The storefront is created before its photos upload, so a failed picture
  // must say so here rather than leave someone wondering why the banner is
  // empty on a demo they are about to send a customer.
  const uploadFailed = (await searchParams).upload === "failed";
  const previewLogin = await getPreviewLogin(id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servdph.com";
  const url = `${appUrl}/r/${s.slug}`;
  const field = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const qr = await qrPngDataUrl(url); // QR to the live ordering page — send to the customer

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super-admin/storefronts" className="text-sm text-plum-ink/50">
          ← Demo storefronts
        </Link>
        <h1 className="font-heading text-2xl font-bold">{s.name}</h1>
      </div>

      {uploadFailed && (
        <p className="rounded-tile border border-guava/30 bg-guava/5 p-3 text-sm text-guava">
          The storefront was created, but a photo didn&apos;t upload — it was probably over 4 MB.
          Add it again below.
        </p>
      )}

      {/* Public link + QR */}
      <div className="rounded-tile border border-brand-primary/20 bg-brand-primary/5 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">Live ordering page</p>
            <p className="mt-1 break-all font-mono text-sm text-brand-primary">{url}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white"
              >
                Open storefront ↗
              </a>
              <CopyLink url={url} />
            </div>
            {s.categories.every((c) => c.items.length === 0) && (
              <p className="mt-2 text-xs text-plum-ink/55">
                Add at least one menu item below so the storefront shows products.
              </p>
            )}
          </div>

          {/* Scannable QR — send this to the customer */}
          <div className="shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt={`QR code for ${s.name}`}
              className="h-40 w-40 rounded-lg border border-plum-ink/10 bg-white p-2"
            />
            <a
              href={qr}
              download={`${s.slug}-qr.png`}
              className="mt-2 inline-block rounded-lg border border-plum-ink/15 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-cream"
            >
              ⬇ Download QR
            </a>
            <p className="mt-1 text-[11px] text-plum-ink/45">Scan to open the menu</p>
          </div>
        </div>

        {/* The Facebook post showing this prospect their preview. Sits with the
            other shareable things, because sending it is the job it exists for. */}
        <div className="mt-4 border-t border-brand-primary/15 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
            Facebook preview post
          </p>
          {s.previewPostUrl ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <a
                href={s.previewPostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 break-all font-mono text-sm text-brand-primary underline"
              >
                {s.previewPostUrl}
              </a>
              <CopyLink url={s.previewPostUrl} label="Copy post link" />
            </div>
          ) : (
            <p className="mt-1 text-sm text-plum-ink/45">
              None yet — paste it in Business details below, and it shows here for the team to send.
            </p>
          )}
        </div>
      </div>

      {/* Business details */}
      <form action={updateDemoDetails} className="grid gap-3 rounded-tile border border-plum-ink/10 bg-white p-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={s.id} />
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55 sm:col-span-2">
          Business details
        </h2>
        <input name="name" defaultValue={s.name} required placeholder="Business name *" className={field} />
        <input name="phone" defaultValue={s.phone ?? ""} placeholder="Phone" className={field} />
        <input name="address" defaultValue={s.address ?? ""} placeholder="Address" className={`sm:col-span-2 ${field}`} />
        <input name="tagline" defaultValue={s.tagline ?? ""} placeholder="Tagline" className={field} />

        {/* Where the team gets the link they actually send to the customer. */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-plum-ink/55">
            Facebook preview post link
          </label>
          <input
            name="previewPostUrl"
            type="url"
            inputMode="url"
            defaultValue={s.previewPostUrl ?? ""}
            placeholder="https://www.facebook.com/…"
            className={field}
          />
          <p className="mt-1 text-[11px] text-plum-ink/40">
            Paste the post you made showing this business their preview. It appears at the top of
            this page so the team can copy it straight to the customer. Clear the box to remove it.
          </p>
        </div>

        {/* Business logo — upload a file, or paste an image URL. */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-plum-ink/55">Business logo</label>
          <div className="flex items-center gap-3">
            {s.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logoUrl} alt="Current logo" className="h-14 w-14 shrink-0 rounded-lg border border-plum-ink/10 object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-cream text-[10px] text-plum-ink/40">
                no logo
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <input name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-xs" />
              <input name="logoUrl" defaultValue={s.logoUrl ?? ""} placeholder="…or paste a logo image URL" className={`${field} text-xs`} />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-plum-ink/40">JPEG / PNG / WebP, up to 4 MB. Uploading a file replaces the URL.</p>
        </div>

        {/* Cover photo — the banner across the top of their storefront, and the
            picture that appears when the link is shared in Messenger. */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-plum-ink/55">Cover photo</label>
          <div className="flex items-center gap-3">
            {s.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.coverImageUrl} alt="Current cover photo" className="h-14 w-24 shrink-0 rounded-lg border border-plum-ink/10 object-cover" />
            ) : (
              <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-cream text-[10px] text-plum-ink/40">
                no cover
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <input name="cover" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-xs" />
              <input name="coverImageUrl" defaultValue={s.coverImageUrl ?? ""} placeholder="…or paste a cover image URL" className={`${field} text-xs`} />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-plum-ink/40">
            Wide shot of the food or the shop, around 1200×600. JPEG / PNG / WebP, up to 4 MB.
          </p>
        </div>

        <div className="sm:col-span-2">
          <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold hover:bg-cream">
            Save details
          </button>
        </div>
      </form>

      {/* Temporary login for pitching this storefront */}
      <PreviewLoginPanel restaurantId={s.id} existing={previewLogin} />

      {/* Convert demo → real account */}
      <ConvertDemoForm restaurantId={s.id} />

      {/* Menu builder */}
      <div className="space-y-4">
        <h2 className="font-heading text-lg font-bold">Menu</h2>

        <ScanMenuForm restaurantId={s.id} />

        {s.categories.map((cat) => (
          <div key={cat.id} className="rounded-tile border border-plum-ink/10 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading font-bold">{cat.name}</h3>
              <form action={deleteCategory}>
                <input type="hidden" name="restaurantId" value={s.id} />
                <input type="hidden" name="id" value={cat.id} />
                <button className="text-xs text-muted hover:text-guava">delete category</button>
              </form>
            </div>

            {cat.items.length > 0 && (
              <ul className="mb-3 divide-y divide-plum-ink/5">
                {cat.items.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.imageUrl} alt={it.name} className="h-9 w-9 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-cream text-[10px] text-plum-ink/40">no img</span>
                      )}
                      <div className="min-w-0">
                        <span className={`font-medium ${it.isAvailable ? "" : "text-plum-ink/40 line-through"}`}>
                          {it.name}
                        </span>
                        {it.description && <span className="block text-xs text-plum-ink/45">{it.description}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatPeso(it.price)}</span>
                      <form action={uploadItemPhoto} className="flex items-center gap-1">
                        <input type="hidden" name="restaurantId" value={s.id} />
                        <input type="hidden" name="id" value={it.id} />
                        <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="w-24 text-[10px]" />
                        <button className="rounded border border-plum-ink/15 px-1.5 py-0.5 text-[11px] hover:bg-cream" title="Upload photo">📷</button>
                      </form>
                      <form action={setItemPhotoUrl} className="flex items-center gap-1">
                        <input type="hidden" name="restaurantId" value={s.id} />
                        <input type="hidden" name="id" value={it.id} />
                        <input
                          name="imageUrl"
                          type="url"
                          defaultValue={it.imageUrl ?? ""}
                          placeholder="paste image address"
                          className="w-32 rounded border border-plum-ink/15 px-1.5 py-0.5 text-[10px]"
                        />
                        <button className="rounded border border-plum-ink/15 px-1.5 py-0.5 text-[11px] hover:bg-cream" title="Use image address (no download)">🔗</button>
                      </form>
                      <form action={toggleItem}>
                        <input type="hidden" name="restaurantId" value={s.id} />
                        <input type="hidden" name="id" value={it.id} />
                        <input type="hidden" name="available" value={(!it.isAvailable).toString()} />
                        <button className="rounded border border-plum-ink/15 px-2 py-0.5 text-xs hover:bg-cream">
                          {it.isAvailable ? "in stock" : "sold out"}
                        </button>
                      </form>
                      <form action={deleteItem}>
                        <input type="hidden" name="restaurantId" value={s.id} />
                        <input type="hidden" name="id" value={it.id} />
                        <button className="text-xs text-muted hover:text-guava">✕</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Add item */}
            <form action={addItem} className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
              <input type="hidden" name="restaurantId" value={s.id} />
              <input type="hidden" name="categoryId" value={cat.id} />
              <input name="name" required placeholder="Item name" className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm" />
              <input name="price" type="number" step="0.01" min="0" placeholder="₱ price" className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm" />
              <button className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white">Add item</button>
              <input name="description" placeholder="Short description (optional)" className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm sm:col-span-3" />
              <input name="imageUrl" type="url" placeholder="Paste an image address / URL (optional — no download needed)" className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm sm:col-span-3" />
              <label className="text-xs text-plum-ink/55 sm:col-span-3">
                …or upload a photo: <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="text-xs" />
              </label>
            </form>
          </div>
        ))}

        {/* Add category */}
        <form action={addCategory} className="flex gap-2 rounded-tile border border-dashed border-plum-ink/15 bg-white p-3">
          <input type="hidden" name="restaurantId" value={s.id} />
          <input name="name" required placeholder="New category — e.g. BBQ, Drinks, Sides" className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          <button className="rounded-full border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary">
            + Add category
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <form action={deleteDemoStorefront} className="border-t border-plum-ink/10 pt-4">
        <input type="hidden" name="id" value={s.id} />
        <button className="text-xs font-semibold text-guava hover:underline">Delete this storefront</button>
      </form>
    </div>
  );
}
