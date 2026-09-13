import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePartnerPage } from "@/server/partners/auth";
import { partnerOwnsDemo, demoLogin, demoAlreadyScanned } from "@/server/partners/demo-queries";
import { getDemoStorefront } from "@/server/storefront-demo/queries";
import {
  updatePartnerDemoDetails,
  addPartnerCategory,
  deletePartnerCategory,
  addPartnerItem,
  deletePartnerItem,
  togglePartnerItem,
  uploadPartnerItemPhoto,
  setPartnerItemPhotoUrl,
  deletePartnerDemo,
} from "@/server/partners/demo";
import { CopyLink } from "@/components/super-admin/CopyLink";
import { PartnerScanMenuForm } from "@/components/partner/PartnerScanMenuForm";
import { PartnerConvertForm } from "@/components/partner/PartnerConvertForm";
import { formatPeso } from "@/lib/money";
import { qrPngDataUrl } from "@/lib/qr";

export const metadata = { title: "Demo storefront · Servd" };

export default async function PartnerDemoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await requirePartnerPage();
  if (partner.status !== "approved" || !(await partnerOwnsDemo(id, partner.id))) notFound();

  const s = await getDemoStorefront(id);
  if (!s) notFound();
  const login = await demoLogin(id);
  const scanned = await demoAlreadyScanned(id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servdph.com";
  const url = `${appUrl}/r/${s.slug}`;
  const field = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const qr = await qrPngDataUrl(url);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <Link href="/partner" className="text-sm text-plum-ink/50">
          ← Partner dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">{s.name}</h1>
      </div>

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

          <div className="shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`QR code for ${s.name}`} className="h-40 w-40 rounded-lg border border-plum-ink/10 bg-white p-2" />
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
      </div>

      {/* Convert — the point of the whole preview. Once it has a login it's
          their real account, so the panel turns into a reminder of the handle
          they log in with. */}
      {login.converted ? (
        <div className="rounded-tile border border-mango/30 bg-mango/10 p-4">
          <p className="font-heading font-bold text-plum-ink">✅ Real account</p>
          <p className="mt-1 text-sm text-plum-ink/70">
            The owner logs in{login.username ? (
              <> as <strong className="font-mono">{login.username}</strong></>
            ) : null}
            . On the ₱0 Free plan — Servd bills them nothing; what they pay you is between you and
            them. You can still edit their menu from here.
          </p>
        </div>
      ) : (
        <PartnerConvertForm restaurantId={s.id} />
      )}

      {/* Business details */}
      <form action={updatePartnerDemoDetails} className="grid gap-3 rounded-tile border border-plum-ink/10 bg-white p-4 sm:grid-cols-2">
        <input type="hidden" name="restaurantId" value={s.id} />
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55 sm:col-span-2">
          Business details
        </h2>
        <input name="name" defaultValue={s.name} required placeholder="Business name *" className={field} />
        <input name="phone" defaultValue={s.phone ?? ""} placeholder="Phone" className={field} />
        <input name="address" defaultValue={s.address ?? ""} placeholder="Address" className={`sm:col-span-2 ${field}`} />
        <input name="tagline" defaultValue={s.tagline ?? ""} placeholder="Tagline" className={field} />

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
          <p className="mt-1 text-[11px] text-plum-ink/40">JPEG / PNG / WebP, up to 5 MB. Uploading a file replaces the URL.</p>
        </div>

        <div className="sm:col-span-2">
          <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold hover:bg-cream">
            Save details
          </button>
        </div>
      </form>

      {/* Menu builder */}
      <div className="space-y-4">
        <h2 className="font-heading text-lg font-bold">Menu</h2>

        <PartnerScanMenuForm restaurantId={s.id} alreadyScanned={scanned} />

        {s.categories.map((cat) => (
          <div key={cat.id} className="rounded-tile border border-plum-ink/10 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading font-bold">{cat.name}</h3>
              <form action={deletePartnerCategory}>
                <input type="hidden" name="restaurantId" value={s.id} />
                <input type="hidden" name="id" value={cat.id} />
                <button className="text-xs text-plum-ink/45 hover:text-guava">delete category</button>
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
                        <span className={`font-medium ${it.isAvailable ? "" : "text-plum-ink/40 line-through"}`}>{it.name}</span>
                        {it.description && <span className="block text-xs text-plum-ink/45">{it.description}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatPeso(it.price)}</span>
                      <form action={uploadPartnerItemPhoto} className="flex items-center gap-1">
                        <input type="hidden" name="restaurantId" value={s.id} />
                        <input type="hidden" name="id" value={it.id} />
                        <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="w-24 text-[10px]" />
                        <button className="rounded border border-plum-ink/15 px-1.5 py-0.5 text-[11px] hover:bg-cream" title="Upload photo">📷</button>
                      </form>
                      <form action={setPartnerItemPhotoUrl} className="flex items-center gap-1">
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
                      <form action={togglePartnerItem}>
                        <input type="hidden" name="restaurantId" value={s.id} />
                        <input type="hidden" name="id" value={it.id} />
                        <input type="hidden" name="available" value={(!it.isAvailable).toString()} />
                        <button className="rounded border border-plum-ink/15 px-2 py-0.5 text-xs hover:bg-cream">
                          {it.isAvailable ? "in stock" : "sold out"}
                        </button>
                      </form>
                      <form action={deletePartnerItem}>
                        <input type="hidden" name="restaurantId" value={s.id} />
                        <input type="hidden" name="id" value={it.id} />
                        <button className="text-xs text-plum-ink/45 hover:text-guava">✕</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Add item */}
            <form action={addPartnerItem} className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
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
        <form action={addPartnerCategory} className="flex gap-2 rounded-tile border border-dashed border-plum-ink/15 bg-white p-3">
          <input type="hidden" name="restaurantId" value={s.id} />
          <input name="name" required placeholder="New category — e.g. BBQ, Drinks, Sides" className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          <button className="rounded-full border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary">
            + Add category
          </button>
        </form>
      </div>

      {/* Danger zone — demos only. A converted storefront is a real shop with
          real orders in it; the server refuses to delete one either way. */}
      {!login.converted && (
        <form action={deletePartnerDemo} className="border-t border-plum-ink/10 pt-4">
          <input type="hidden" name="id" value={s.id} />
          <button className="text-xs font-semibold text-guava hover:underline">Delete this storefront</button>
        </form>
      )}
    </div>
  );
}
