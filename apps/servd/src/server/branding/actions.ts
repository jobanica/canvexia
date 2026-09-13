"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { uploadMenuImage } from "@/server/storage/menu-images";

export type FormState = { ok?: boolean; error?: string } | null;

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #FF8A1E")
  .optional()
  .or(z.literal(""));

const schema = z.object({
  displayName: z.string().trim().max(80).optional().or(z.literal("")),
  tagline: z.string().trim().max(140).optional().or(z.literal("")),
  brandPrimaryColor: hex,
  brandAccentColor: hex,
});

export async function updateBranding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = schema.safeParse({
    displayName: formData.get("displayName") ?? "",
    tagline: formData.get("tagline") ?? "",
    brandPrimaryColor: formData.get("brandPrimaryColor") ?? "",
    brandAccentColor: formData.get("brandAccentColor") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Optional image uploads (reuse the validated menu-image uploader).
  let logoUrl: string | undefined;
  let coverImageUrl: string | undefined;
  try {
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
      logoUrl = await uploadMenuImage(restaurantId, logo);
    }
    const cover = formData.get("cover");
    if (cover instanceof File && cover.size > 0) {
      coverImageUrl = await uploadMenuImage(restaurantId, cover);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image upload failed" };
  }

  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        displayName: parsed.data.displayName || null,
        tagline: parsed.data.tagline || null,
        brandPrimaryColor: parsed.data.brandPrimaryColor || null,
        brandAccentColor: parsed.data.brandAccentColor || null,
        ...(logoUrl ? { logoUrl } : {}),
        ...(coverImageUrl ? { coverImageUrl } : {}),
      },
      select: { id: true },
    }),
  );

  revalidatePath("/admin/branding");
  revalidatePath("/admin/onboarding");
  return { ok: true };
}
