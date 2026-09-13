"use server";

import { z } from "zod";
import { systemDb } from "@/server/tenancy/scoped-db";
import { uniqueSlug } from "@/lib/slug";
import { pesosToCentavos } from "@/lib/money";
import { uploadMenuImage } from "@/server/storage/menu-images";
import { normalizePhone, isValidPhone } from "@/lib/phone";
import { rateLimit } from "./rate-limit";
import {
  currentBuild,
  newBuildToken,
  setBuildCookie,
  type BuildContext,
} from "./session";
import { getBuildState, type BuildState } from "./queries";
import { enrolTrackA } from "@/server/email/followup";
import { currentUtm } from "@/server/landing/stats";
import { hasUtm } from "@/lib/utm";

/**
 * Server actions behind the public DIY builder (/build). There is no session:
 * the build token in the cookie is the capability, and every action resolves
 * the restaurant through it. All of these refuse to touch anything that isn't
 * still `status = 'preview'`, so the anonymous funnel can never edit a live
 * account, and all writes go through systemDb (the builder has no tenant JWT).
 */

export type BuildResult = { ok: true; state: BuildState } | { ok: false; error: string };

const DEFAULT_CATEGORY = "Menu";

// Email and phone are REQUIRED: this is the founder's follow-up list, and a
// lead with no way to reach them is worth nothing. Facebook stays optional.
const businessSchema = z.object({
  name: z.string().trim().min(2, "Enter your restaurant name").max(80),
  contactEmail: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
  contactPhone: z
    .string()
    .trim()
    .refine((v) => isValidPhone(v), "Enter an 11-digit mobile number (e.g. 09171234567)"),
  contactFb: z.string().trim().max(200).optional().or(z.literal("")),
});

async function stateOf(ctx: BuildContext): Promise<BuildResult> {
  const state = await getBuildState(ctx.token);
  return state ? { ok: true, state } : { ok: false, error: "This build link is no longer valid." };
}

/**
 * Step ① — create or update the preview restaurant. The FIRST call mints the
 * build token and drops the cookie, which is what lets the owner close the tab
 * and come back later. Logo is optional here so the form can save as they type;
 * the wizard requires it client-side before moving on.
 */
export async function saveBusiness(formData: FormData): Promise<BuildResult> {
  const parsed = businessSchema.safeParse({
    name: formData.get("name"),
    contactEmail: formData.get("contactEmail") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactFb: formData.get("contactFb") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const { name, contactEmail } = parsed.data;
  const contactPhone = normalizePhone(parsed.data.contactPhone);
  const contactFb = parsed.data.contactFb ?? "";

  const existing = await currentBuild();

  // Optional logo upload (needs a restaurant id for the storage path).
  const logoFile = formData.get("logo");
  const hasLogo = logoFile instanceof File && logoFile.size > 0;
  if (hasLogo) {
    const limited = await rateLimit("build:upload");
    if (!limited.ok) return { ok: false, error: limited.error! };
  }

  if (existing) {
    const limited = await rateLimit("build:write");
    if (!limited.ok) return { ok: false, error: limited.error! };
    let logoUrl: string | undefined;
    if (hasLogo) {
      try {
        logoUrl = await uploadMenuImage(existing.restaurantId, logoFile as File);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Couldn't upload that logo." };
      }
    }
    await systemDb((tx) =>
      tx.restaurant.update({
        where: { id: existing.restaurantId },
        data: {
          name,
          displayName: name,
          contactEmail,
          contactPhone: contactPhone || null,
          contactFb: contactFb || null,
          ...(logoUrl ? { logoUrl } : {}),
        },
        select: { id: true },
      }),
    );
    return stateOf(existing);
  }

  // First save → a brand new preview tenant.
  const limited = await rateLimit("build:create");
  if (!limited.ok) return { ok: false, error: limited.error! };

  const token = newBuildToken();
  // Which ad brought them. Captured into a cookie by the middleware at /create,
  // stamped on here so the activation can be traced back to a creative.
  const utm = await currentUtm();
  const attribution = hasUtm(utm)
    ? {
        utmSource: utm.source || null,
        utmMedium: utm.medium || null,
        utmCampaign: utm.campaign || null,
        utmContent: utm.content || null,
      }
    : {};

  let ctx: BuildContext;
  try {
    ctx = await systemDb(async (tx) => {
      const slug = await uniqueSlug(
        name,
        async (s) => !!(await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } })),
      );
      const r = await tx.restaurant.create({
        data: {
          name,
          displayName: name,
          slug,
          // Not a real account: invisible to /r/[slug], has no login, and the
          // order pipeline refuses it. Only /preview/[slug] will render it.
          status: "preview",
          buildToken: token,
          builtVia: "diy",
          contactEmail,
          contactPhone: contactPhone || null,
          contactFb: contactFb || null,
          previewCreatedAt: new Date(),
        },
        select: { id: true, slug: true },
      });
      // One default category so quick-add never has to ask for one.
      await tx.category.create({
        data: { restaurantId: r.id, name: DEFAULT_CATEGORY, sortOrder: 0 },
        select: { id: true },
      });
      return { restaurantId: r.id, token, slug: r.slug };
    });
  } catch {
    return { ok: false, error: "Couldn't start your preview. Please try again." };
  }

  // Written separately from the create above, deliberately: if these columns
  // haven't been migrated onto the live database yet, a failed metric must not
  // cost someone the preview they were starting.
  if (hasUtm(utm)) {
    try {
      await systemDb((tx) =>
        tx.restaurant.update({
          where: { id: ctx.restaurantId },
          data: attribution,
          select: { id: true },
        }),
      );
    } catch {
      /* columns not migrated yet */
    }
  }

  if (hasLogo) {
    try {
      const logoUrl = await uploadMenuImage(ctx.restaurantId, logoFile as File);
      await systemDb((tx) =>
        tx.restaurant.update({ where: { id: ctx.restaurantId }, data: { logoUrl }, select: { id: true } }),
      );
    } catch {
      // A failed logo must not lose the build they just started.
    }
  }

  await setBuildCookie(token);
  // Auto-subscribe to the acquisition follow-up. They gave us an address so we
  // could save their work — this is how we do that. Best-effort: scheduling
  // must never cost someone the build they just started.
  await enrolTrackA(ctx.restaurantId);
  return stateOf(ctx);
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "Enter the item name").max(80),
  pricePesos: z.coerce.number().min(0, "Price can't be negative").max(1_000_000),
  category: z.string().trim().max(60).optional().or(z.literal("")),
});

/** Step ② — quick-add one menu item (optionally with a photo). */
export async function addBuildItem(formData: FormData): Promise<BuildResult> {
  const ctx = await currentBuild();
  if (!ctx) return { ok: false, error: "Start with your restaurant name first." };

  const parsed = itemSchema.safeParse({
    name: formData.get("name"),
    pricePesos: formData.get("pricePesos") ?? 0,
    category: formData.get("category") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the item." };
  }

  const photo = formData.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;
  const limited = await rateLimit(hasPhoto ? "build:upload" : "build:write");
  if (!limited.ok) return { ok: false, error: limited.error! };

  // Keep a preview build small — this is a taster, not the full menu import.
  const count = await systemDb((tx) => tx.menuItem.count({ where: { restaurantId: ctx.restaurantId } }));
  if (count >= 60) {
    return { ok: false, error: "That's plenty for a preview — activate to add your full menu." };
  }

  let imageUrl: string | null = null;
  if (hasPhoto) {
    try {
      imageUrl = await uploadMenuImage(ctx.restaurantId, photo as File);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Couldn't upload that photo." };
    }
  }

  const categoryName = (parsed.data.category || DEFAULT_CATEGORY).trim();
  try {
    await systemDb(async (tx) => {
      let category = await tx.category.findFirst({
        where: { restaurantId: ctx.restaurantId, name: categoryName },
        select: { id: true },
      });
      if (!category) {
        const sortOrder = await tx.category.count({ where: { restaurantId: ctx.restaurantId } });
        category = await tx.category.create({
          data: { restaurantId: ctx.restaurantId, name: categoryName, sortOrder },
          select: { id: true },
        });
      }
      await tx.menuItem.create({
        data: {
          restaurantId: ctx.restaurantId,
          categoryId: category.id,
          name: parsed.data.name,
          price: pesosToCentavos(parsed.data.pricePesos),
          imageUrl,
          sortOrder: count,
        },
        select: { id: true },
      });
    });
  } catch {
    return { ok: false, error: "Couldn't add that item. Please try again." };
  }
  return stateOf(ctx);
}

export async function deleteBuildItem(itemId: string): Promise<BuildResult> {
  const ctx = await currentBuild();
  if (!ctx) return { ok: false, error: "This build link is no longer valid." };
  const limited = await rateLimit("build:write");
  if (!limited.ok) return { ok: false, error: limited.error! };
  // Scoped by restaurantId as well as id — a token can only ever delete its own.
  await systemDb((tx) =>
    tx.menuItem.deleteMany({ where: { id: itemId, restaurantId: ctx.restaurantId } }),
  );
  return stateOf(ctx);
}

/** Reads the current build (for polling the wizard after a redirect). */
export async function getMyBuild(): Promise<BuildState | null> {
  const ctx = await currentBuild();
  return ctx ? getBuildState(ctx.token) : null;
}
