"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { systemDb } from "@/server/tenancy/scoped-db";
import { pesosToCentavos } from "@/lib/money";
import { requireWritablePartner } from "@/server/partners/auth";
import { receiptJson } from "@/server/storefront-demo/provision";
import { provisionMerchantForPartner } from "@/server/products";
import { convertDemo } from "@/server/storefront-demo/convert";
import { PARTNER_SCAN_LIMIT } from "@/lib/menu/scan-limit";
import { demoAlreadyScanned } from "@/server/partners/demo-queries";
import { scanAndSaveMenu } from "@/server/storefront-demo/scan-save";
import { uploadMenuImage } from "@/server/storage/menu-images";

const PATH = "/partner";
const demoPath = (id: string) => `/partner/demo/${id}`;

export type DemoFormState = { ok?: boolean; error?: string } | null;
export type DemoScanState = { ok?: boolean; added?: number; error?: string } | null;

/**
 * THE capability every action in this file needs: `merchants.create`.
 *
 * Not `merchants.manage`, even for the edit and delete actions, although the
 * two look like they should split that way. A demo storefront has no login, no
 * plan, no invoices and no orders — nothing `merchants.manage` describes — and
 * this whole file is one flow: open a demo, fill in its menu, hand over a
 * login. Gating the menu builder on `merchants.manage` would leave a sales seat
 * able to open an empty demo and unable to put anything in it, which is the one
 * thing a sales seat exists to do.
 *
 * `deletePartnerDemo` stays here for the same reason: it refuses anything with
 * staff, so it can only ever remove a demo that never became a real merchant.
 */
const DEMO_CAPABILITY = "merchants.create" as const;

/**
 * The actor for a demo action: approved, holds `merchants.create`, and NOT HQ
 * looking over their shoulder.
 *
 * This used to call `getCurrentPartner()` and check only `status`. Two holes,
 * both live: `getCurrentPartner()` RESOLVES an impersonation grant, so an HQ
 * "view as" session — which the portal declares read-only on every screen —
 * could create, edit, convert and delete storefronts in an operator's name; and
 * with no capability check, a support seat could do the same. `convertDemo`
 * returns working merchant credentials, so the second hole ended in a login.
 */
async function requireDemoWriter() {
  const who = await requireWritablePartner(DEMO_CAPABILITY);
  if (!who) throw new Error("UNAUTHORIZED");
  return who.partner;
}

/**
 * Confirm a storefront belongs to this partner before mutating it.
 *
 * Checks `partnerId` — ownership — and NOT `demoPartnerId`, which records who
 * built the storefront and never changes. Since Phase 2, HQ can reassign a
 * merchant to a different partner; `demoPartnerId` still names the original
 * builder afterwards, so a check against it would let the previous partner keep
 * editing and deleting a merchant that is no longer theirs.
 */
async function ownDemo(restaurantId: string, partnerId: string): Promise<boolean> {
  const hit = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { id: restaurantId, partnerId }, select: { id: true } }),
  );
  return !!hit;
}

/**
 * Guard for void form actions on a demo the partner owns. Returns the
 * restaurantId if the caller may write for this partner AND owns the demo,
 * else null — which every caller treats as "do nothing", silently, because
 * these are void form posts with nowhere to put a message.
 */
async function guardOwnedDemo(formData: FormData): Promise<string | null> {
  const who = await requireWritablePartner(DEMO_CAPABILITY);
  if (!who) return null;
  const restaurantId = String(formData.get("restaurantId") ?? "");
  if (!restaurantId || !(await ownDemo(restaurantId, who.partnerId))) return null;
  return restaurantId;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Business name is required").max(80),
  tagline: z.string().trim().max(120).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(400).optional().or(z.literal("")),
});

/**
 * Partner creates a DEMO storefront for a prospect — a live /r/{slug} ordering
 * page with no login, tagged to the partner. Foot-in-the-door for pitching.
 */
export async function createPartnerDemo(_prev: DemoFormState, formData: FormData): Promise<DemoFormState> {
  let partner;
  try {
    partner = await requireDemoWriter();
  } catch {
    // One message for all three refusals — not approved, wrong seat, or an HQ
    // read-only session. Which one it was is not something to tell a form post.
    return { error: "You can't build storefronts from this account." };
  }
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    tagline: formData.get("tagline") ?? "",
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  // Goes through the product dispatch rather than calling Servd's own
  // restaurant creation. The product id is hard-coded here only because this
  // action IS the Servd demo builder; the generic "create a merchant" flow in
  // the portal passes whichever product the partner picked, and neither knows
  // what a restaurant is.
  try {
    const outcome = await provisionMerchantForPartner("servd", partner.id, {
      name: d.name,
      tagline: d.tagline ?? "",
      address: d.address ?? "",
      phone: d.phone ?? "",
      logoUrl: d.logoUrl ?? "",
    });
    if (!outcome.ok) return { error: outcome.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the storefront." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Partner: AI-scan a menu photo/PDF into one of their demo storefronts. */
export async function scanPartnerDemoMenu(_prev: DemoScanState, formData: FormData): Promise<DemoScanState> {
  let partner;
  try {
    partner = await requireDemoWriter();
  } catch {
    // One message for all three refusals — not approved, wrong seat, or an HQ
    // read-only session. Which one it was is not something to tell a form post.
    return { error: "You can't build storefronts from this account." };
  }
  const restaurantId = String(formData.get("restaurantId") ?? "");
  if (!(await ownDemo(restaurantId, partner.id))) return { error: "Storefront not found." };

  // One scan per storefront, one photo per scan. Each file is an AI vision call
  // billed to us, and a partner opens unlimited demos — so the spend is capped
  // where it's created rather than trusted to good manners.
  //
  // Both checks live here, not just in the form: this is an ordinary POST, and
  // a hidden button or a missing `multiple` attribute stops nobody.
  if (await demoAlreadyScanned(restaurantId)) {
    return {
      error:
        "This storefront has already been scanned. Add or edit the remaining items by hand below.",
    };
  }

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const res = await scanAndSaveMenu(restaurantId, files, PARTNER_SCAN_LIMIT);
  if (!res.ok) return { error: res.error };

  // Stamp it only on success — a scan that failed or read nothing shouldn't
  // burn the storefront's one attempt. Best-effort: if the column isn't there
  // yet, the fallback in demoAlreadyScanned covers it.
  try {
    await systemDb((tx) =>
      tx.restaurant.update({
        where: { id: restaurantId },
        data: { menuScannedAt: new Date() },
        select: { id: true },
      }),
    );
  } catch {
    /* menuScannedAt not migrated yet — run add-menu-scanned-at.sql */
  }
  revalidatePath(PATH);
  revalidatePath(demoPath(restaurantId));
  return { ok: true, added: res.added };
}

export type PartnerConvertState =
  | { ok?: boolean; error?: string; credentials?: { username: string; password: string } }
  | null;

/**
 * Partner: turn one of their demos into a real account.
 *
 * This is the moment the pitch lands — the prospect said yes, and the partner
 * hands them a login to the exact storefront they've been looking at. The menu,
 * the slug and the QR codes all carry over, so nothing has to be rebuilt.
 *
 * It goes onto the ₱0 Free plan, not a trial: Servd doesn't bill a restaurant a
 * partner set up. The partner charges that restaurant directly, at whatever
 * price they agreed, and paid features stay locked until somebody buys them.
 *
 * No approval step. A partner's whole advantage is that they can open accounts
 * as fast as they can sell them.
 */
export async function convertPartnerDemo(
  _prev: PartnerConvertState,
  formData: FormData,
): Promise<PartnerConvertState> {
  let partner;
  try {
    partner = await requireDemoWriter();
  } catch {
    // One message for all three refusals — not approved, wrong seat, or an HQ
    // read-only session. Which one it was is not something to tell a form post.
    return { error: "You can't build storefronts from this account." };
  }
  const restaurantId = String(formData.get("restaurantId") ?? "");
  if (!restaurantId || !(await ownDemo(restaurantId, partner.id))) {
    return { error: "Storefront not found." };
  }

  const res = await convertDemo(restaurantId, formData.get("username"), "free");
  if (!res.ok) return { error: res.error };

  revalidatePath(PATH);
  revalidatePath(demoPath(restaurantId));
  return { ok: true, credentials: res.credentials };
}

/**
 * Partner: delete one of their own demo storefronts.
 *
 * Only while it's still a demo. Once it has a login it's somebody's real shop,
 * with real orders in it, and it still belongs to this partner — so without the
 * `staff: { none: {} }` guard this button would let a partner wipe a live
 * restaurant and its entire history.
 */
export async function deletePartnerDemo(formData: FormData): Promise<void> {
  const partner = await requireDemoWriter();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Ownership enforced in the where clause — a partner can't delete another's.
  await systemDb((tx) =>
    tx.restaurant.deleteMany({ where: { id, partnerId: partner.id, staff: { none: {} } } }),
  );
  revalidatePath(PATH);
  redirect(PATH);
}

// --------------------------------------------------------------- Menu builder
// All actions below are ownership-checked (the demo must belong to the partner)
// and scope every write by restaurantId so a partner can only touch their own.

/** Edit the demo's business details + logo (upload a file OR paste a URL). */
export async function updatePartnerDemoDetails(formData: FormData): Promise<void> {
  const restaurantId = await guardOwnedDemo(formData);
  if (!restaurantId) return;
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  let logoUpdate: { logoUrl?: string | null } = {};
  const logoFile = formData.get("logo");
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  if (logoFile instanceof File && logoFile.size > 0) {
    try {
      logoUpdate = { logoUrl: await uploadMenuImage(restaurantId, logoFile) };
    } catch {
      /* keep any pasted URL on upload failure */
    }
  }
  if (!logoUpdate.logoUrl && formData.has("logoUrl")) {
    logoUpdate = { logoUrl: logoUrl || null };
  }

  await systemDb((tx) =>
    tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(name ? { name, displayName: name } : {}),
        tagline: tagline || null,
        ...logoUpdate,
        printerConfig: receiptJson(address, phone),
      },
      select: { id: true },
    }),
  );
  revalidatePath(demoPath(restaurantId));
}

export async function addPartnerCategory(formData: FormData): Promise<void> {
  const restaurantId = await guardOwnedDemo(formData);
  if (!restaurantId) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await systemDb((tx) => tx.category.create({ data: { restaurantId, name: name.slice(0, 80) }, select: { id: true } }));
  revalidatePath(demoPath(restaurantId));
}

export async function deletePartnerCategory(formData: FormData): Promise<void> {
  const restaurantId = await guardOwnedDemo(formData);
  if (!restaurantId) return;
  const id = String(formData.get("id") ?? "");
  await systemDb((tx) => tx.category.deleteMany({ where: { id, restaurantId } }));
  revalidatePath(demoPath(restaurantId));
}

export async function addPartnerItem(formData: FormData): Promise<void> {
  const restaurantId = await guardOwnedDemo(formData);
  if (!restaurantId) return;
  const categoryId = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name || !categoryId) return;
  // The category must belong to this same demo.
  const cat = await systemDb((tx) =>
    tx.category.findFirst({ where: { id: categoryId, restaurantId }, select: { id: true } }),
  );
  if (!cat) return;

  const price = pesosToCentavos(Number(formData.get("price") ?? 0));
  const description = String(formData.get("description") ?? "").trim() || null;
  let imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) imageUrl = null; // only http(s) addresses
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
      data: { restaurantId, categoryId, name: name.slice(0, 120), price, description, imageUrl },
      select: { id: true },
    }),
  );
  revalidatePath(demoPath(restaurantId));
}

/** Set an item's photo from a pasted image address (no download). */
export async function setPartnerItemPhotoUrl(formData: FormData): Promise<void> {
  const restaurantId = await guardOwnedDemo(formData);
  if (!restaurantId) return;
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("imageUrl") ?? "").trim();
  if (raw && !/^https?:\/\//i.test(raw)) return;
  await systemDb((tx) =>
    tx.menuItem.updateMany({ where: { id, restaurantId }, data: { imageUrl: raw || null } }),
  );
  revalidatePath(demoPath(restaurantId));
}

/** Replace an item's photo from an uploaded file. */
export async function uploadPartnerItemPhoto(formData: FormData): Promise<void> {
  const restaurantId = await guardOwnedDemo(formData);
  if (!restaurantId) return;
  const id = String(formData.get("id") ?? "");
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return;
  let imageUrl: string;
  try {
    imageUrl = await uploadMenuImage(restaurantId, image);
  } catch {
    return;
  }
  await systemDb((tx) => tx.menuItem.updateMany({ where: { id, restaurantId }, data: { imageUrl } }));
  revalidatePath(demoPath(restaurantId));
}

export async function togglePartnerItem(formData: FormData): Promise<void> {
  const restaurantId = await guardOwnedDemo(formData);
  if (!restaurantId) return;
  const id = String(formData.get("id") ?? "");
  const available = formData.get("available") === "true";
  await systemDb((tx) =>
    tx.menuItem.updateMany({ where: { id, restaurantId }, data: { isAvailable: available } }),
  );
  revalidatePath(demoPath(restaurantId));
}

export async function deletePartnerItem(formData: FormData): Promise<void> {
  const restaurantId = await guardOwnedDemo(formData);
  if (!restaurantId) return;
  const id = String(formData.get("id") ?? "");
  await systemDb((tx) => tx.menuItem.deleteMany({ where: { id, restaurantId } }));
  revalidatePath(demoPath(restaurantId));
}
