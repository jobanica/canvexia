"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { pesosToCentavos } from "@/lib/money";
import { migrationHint } from "@/lib/db/migration-hint";
import { uploadMenuImage } from "@/server/storage/menu-images";
import { provisionDemo, receiptJson } from "./provision";
import { convertDemo } from "./convert";
import { createPreviewLogin, revokePreviewLogin } from "./preview-login";
import { scanAndSaveMenu } from "./scan-save";

export type FormState = { ok?: boolean; error?: string } | null;

const PATH = "/super-admin/storefronts";
const detailPath = (id: string) => `${PATH}/${id}`;

const createSchema = z.object({
  name: z.string().trim().min(2, "Business name is required").max(80),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  tagline: z.string().trim().max(120).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(400).optional().or(z.literal("")),
  coverImageUrl: z.string().trim().max(400).optional().or(z.literal("")),
});

/**
 * Create a DEMO online-ordering storefront for a prospect — a real tenant with
 * a live /r/{slug} page, but NO login account. Foot-in-the-door: show them they
 * already have a commission-free ordering system.
 */
export async function createDemoStorefront(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    tagline: formData.get("tagline") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
    coverImageUrl: formData.get("coverImageUrl") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  let id: string;
  try {
    id = await provisionDemo({
      name: d.name,
      address: d.address ?? "",
      phone: d.phone ?? "",
      tagline: d.tagline ?? "",
      logoUrl: d.logoUrl ?? "",
      coverImageUrl: d.coverImageUrl ?? "",
    });
  } catch (e) {
    // A raw "The column `x` does not exist in the current database" reads like
    // the app is broken; it only ever means this database is behind the code.
    return { error: migrationHint(e, "full-schema-sync.sql", "Couldn't create the storefront.") };
  }

  // Uploads happen after provisioning because the storage path is namespaced by
  // restaurant id, which doesn't exist until the row does. A failure here is
  // reported on the detail page rather than thrown: the storefront is already
  // created, and losing it over a photo would be worse than arriving without one.
  const uploadError = await applyBrandingUploads(id, formData);

  revalidatePath(PATH);
  redirect(uploadError ? `${detailPath(id)}?upload=failed` : detailPath(id));
}

/**
 * Upload whichever of logo/cover were picked and store their URLs.
 *
 * Returns an error message rather than throwing. Both are optional, and the
 * two are independent: a cover that's too large must not also discard a logo
 * that uploaded fine.
 */
async function applyBrandingUploads(id: string, formData: FormData): Promise<string | null> {
  const data: { logoUrl?: string; coverImageUrl?: string } = {};
  let failure: string | null = null;

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      data.logoUrl = await uploadMenuImage(id, logo);
    } catch (e) {
      failure = e instanceof Error ? e.message : "Logo upload failed.";
    }
  }

  const cover = formData.get("cover");
  if (cover instanceof File && cover.size > 0) {
    try {
      data.coverImageUrl = await uploadMenuImage(id, cover);
    } catch (e) {
      failure = e instanceof Error ? e.message : "Cover photo upload failed.";
    }
  }

  if (Object.keys(data).length === 0) return failure;
  try {
    await systemDb((tx) => tx.restaurant.update({ where: { id }, data, select: { id: true } }));
  } catch {
    failure = "The photos uploaded but couldn't be saved to the storefront.";
  }
  return failure;
}

/** One-click: build a demo storefront pre-filled from a CRM client's details. */
export async function createDemoFromClient(clientId: string): Promise<void> {
  await requireSuperAdmin();
  const base = await systemDb((tx) =>
    tx.crmClient.findUnique({ where: { id: clientId }, select: { name: true, phone: true } }),
  );
  if (!base) return;
  // address column is best-effort (later migration).
  let address = "";
  try {
    const a = await systemDb((tx) =>
      tx.crmClient.findUnique({ where: { id: clientId }, select: { address: true } }),
    );
    address = a?.address ?? "";
  } catch {
    /* address column not migrated yet */
  }
  const id = await provisionDemo({ name: base.name, address, phone: base.phone ?? "", tagline: "", logoUrl: "" });
  // Link the demo back to the client so the pipeline shows "demo ready".
  try {
    await systemDb((tx) =>
      tx.crmClient.update({ where: { id: clientId }, data: { demoRestaurantId: id }, select: { id: true } }),
    );
  } catch {
    /* demoRestaurantId column not migrated yet — ignore */
  }
  revalidatePath(PATH);
  redirect(detailPath(id));
}

/** Update the demo's business details (name, tagline, logo, contact). */
export async function updateDemoDetails(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  // An uploaded file wins over the pasted URL; blank both leaves the image as
  // it is, so saving a name change can't quietly wipe the branding.
  const logoUpdate = await imageUpdate(id, formData, "logo", "logoUrl");
  const coverUpdate = await imageUpdate(id, formData, "cover", "coverImageUrl");

  // The Facebook post showing this prospect their preview. Clearing the box is
  // a deliberate "there is no post", so an empty string stores NULL rather than
  // being ignored.
  const previewPostUrl = formData.has("previewPostUrl")
    ? String(formData.get("previewPostUrl") ?? "").trim().slice(0, 500) || null
    : undefined;

  await systemDb((tx) =>
    tx.restaurant.update({
      where: { id },
      data: {
        ...(name ? { name, displayName: name } : {}),
        tagline: tagline || null,
        ...(logoUpdate === undefined ? {} : { logoUrl: logoUpdate }),
        ...(coverUpdate === undefined ? {} : { coverImageUrl: coverUpdate }),
        ...(previewPostUrl === undefined ? {} : { previewPostUrl }),
        printerConfig: receiptJson(address, phone),
      },
      select: { id: true },
    }),
  );
  revalidatePath(detailPath(id));
}

/**
 * Resolve one image field from the form.
 *
 * `undefined` means "don't touch it", which is different from `null` — clearing
 * the URL box is a deliberate "remove this picture" and has to survive.
 */
async function imageUpdate(
  id: string,
  formData: FormData,
  fileField: string,
  urlField: string,
): Promise<string | null | undefined> {
  const file = formData.get(fileField);
  if (file instanceof File && file.size > 0) return uploadMenuImage(id, file);
  if (formData.has(urlField)) return String(formData.get(urlField) ?? "").trim() || null;
  return undefined;
}

export async function addCategory(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await systemDb((tx) => tx.category.create({ data: { restaurantId, name }, select: { id: true } }));
  revalidatePath(detailPath(restaurantId));
}

export async function deleteCategory(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  await systemDb((tx) => tx.category.delete({ where: { id } }));
  revalidatePath(detailPath(restaurantId));
}

export async function addItem(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const categoryId = String(formData.get("categoryId"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name || !categoryId) return;
  const price = pesosToCentavos(Number(formData.get("price") ?? 0));
  const description = String(formData.get("description") ?? "").trim() || null;
  let imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  // Optional uploaded photo wins over a pasted URL.
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    try {
      imageUrl = await uploadMenuImage(restaurantId, image);
    } catch {
      /* keep any pasted URL on upload failure */
    }
  }
  await systemDb((tx) =>
    tx.menuItem.create({
      data: { restaurantId, categoryId, name, price, description, imageUrl },
      select: { id: true },
    }),
  );
  revalidatePath(detailPath(restaurantId));
}

/** Replace an existing item's photo from an uploaded file. */
export async function uploadItemPhoto(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return;
  let imageUrl: string;
  try {
    imageUrl = await uploadMenuImage(restaurantId, image);
  } catch {
    return;
  }
  await systemDb((tx) => tx.menuItem.update({ where: { id }, data: { imageUrl }, select: { id: true } }));
  revalidatePath(detailPath(restaurantId));
}

/**
 * Set an existing item's photo from a pasted image address (URL) — no download
 * needed. Demo-storefront only. A blank URL clears the photo.
 */
export async function setItemPhotoUrl(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  const raw = String(formData.get("imageUrl") ?? "").trim();
  // Only accept http(s) image addresses (or blank to clear).
  if (raw && !/^https?:\/\//i.test(raw)) return;
  await systemDb((tx) => tx.menuItem.update({ where: { id }, data: { imageUrl: raw || null }, select: { id: true } }));
  revalidatePath(detailPath(restaurantId));
}

export type ScanState = { ok?: boolean; added?: number; error?: string } | null;

/**
 * AI menu scan: upload menu photo(s), let Claude read them, and append the
 * detected categories + items to the demo storefront's menu.
 */
export async function scanDemoMenu(_prev: ScanState, formData: FormData): Promise<ScanState> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const res = await scanAndSaveMenu(restaurantId, files);
  if (!res.ok) return { error: res.error };
  revalidatePath(detailPath(restaurantId));
  return { ok: true, added: res.added };
}

export type ConvertState =
  | { ok?: boolean; error?: string; credentials?: { username: string; password: string } }
  | null;

/**
 * Convert a demo storefront into a REAL account: attach a username login to the
 * existing tenant (keeping its menu), and start a fresh 30-day Business trial.
 * Returns the credentials to hand the owner.
 *
 * The work is in convertDemo() because a partner can do this too, from their
 * own dashboard — they land on the Free plan rather than a trial, since they
 * bill the restaurant themselves. Everything else has to behave identically.
 */
export async function convertDemoToAccount(_prev: ConvertState, formData: FormData): Promise<ConvertState> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));

  const res = await convertDemo(restaurantId, formData.get("username"), "trial30");
  if (!res.ok) return { error: res.error };

  revalidatePath(detailPath(restaurantId));
  revalidatePath(PATH);
  revalidatePath("/super-admin/accounts");
  return { ok: true, credentials: res.credentials };
}

export async function deleteItem(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  await systemDb((tx) => tx.menuItem.delete({ where: { id } }));
  revalidatePath(detailPath(restaurantId));
}

export async function toggleItem(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  const available = formData.get("available") === "true";
  await systemDb((tx) =>
    tx.menuItem.update({ where: { id }, data: { isAvailable: available }, select: { id: true } }),
  );
  revalidatePath(detailPath(restaurantId));
}

/** Delete the demo storefront entirely (cascades menu + subscription). */
export async function deleteDemoStorefront(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  await systemDb((tx) => tx.restaurant.delete({ where: { id } }));
  revalidatePath(PATH);
  redirect(PATH);
}


/**
 * Issue a temporary merchant login so a prospect can watch an order land.
 *
 * Returns the credentials to read out. They are shown once on the screen that
 * called this; the password is never stored anywhere readable, exactly like the
 * one conversion hands over.
 */
export type PreviewLoginState =
  | { ok: true; username: string; password: string; expiresAt: string }
  | { error: string }
  | null;

export async function issuePreviewLogin(
  _prev: PreviewLoginState,
  formData: FormData,
): Promise<PreviewLoginState> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing storefront." };

  const result = await createPreviewLogin(id);
  if (!result.ok) return { error: result.error };

  revalidatePath(detailPath(id));
  return { ok: true, ...result.credentials };
}

/** Kill the temporary login now, without waiting for it to expire. */
export async function endPreviewLogin(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await revokePreviewLogin(id);
  revalidatePath(detailPath(id));
}
