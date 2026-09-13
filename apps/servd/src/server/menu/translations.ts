"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { LOCALES, DEFAULT_LOCALE } from "@/i18n/locales";

export type FormState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  menuItemId: z.string().uuid(),
  locale: z.enum(LOCALES as unknown as [string, ...string[]]),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * Upserts a menu item's translation for a locale (empty name clears it). The
 * default locale uses the base columns, so it's not editable here.
 */
export async function upsertItemTranslation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const parsed = schema.safeParse({
    menuItemId: formData.get("menuItemId"),
    locale: formData.get("locale"),
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { error: "Invalid input" };
  if (parsed.data.locale === DEFAULT_LOCALE) {
    return { error: "Edit the default language on the item itself." };
  }

  await tenantDb(restaurantId, async (tx) => {
    const item = await tx.menuItem.findFirst({ where: { id: parsed.data.menuItemId } });
    if (!item) throw new Error("Item not found");

    const where = {
      menuItemId_locale: { menuItemId: parsed.data.menuItemId, locale: parsed.data.locale },
    };
    if (!parsed.data.name) {
      await tx.menuItemTranslation.deleteMany({
        where: { menuItemId: parsed.data.menuItemId, locale: parsed.data.locale },
      });
      return;
    }
    await tx.menuItemTranslation.upsert({
      where,
      create: {
        restaurantId,
        menuItemId: parsed.data.menuItemId,
        locale: parsed.data.locale,
        name: parsed.data.name,
        description: parsed.data.description || null,
      },
      update: {
        name: parsed.data.name,
        description: parsed.data.description || null,
      },
    });
  });

  revalidatePath(`/admin/menu/${parsed.data.menuItemId}`);
  return { ok: true };
}
