"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { encryptJson, decryptJson } from "@/lib/crypto/secrets";
import type { ApiCredentials } from "@/server/delivery/provider";

export type DeliveryMode = "manual" | "deeplink" | "api";

export interface DeliverySettingsView {
  provider: DeliveryMode;
  providerKey: string;
  deepLinkTemplate: string;
  apiBaseUrl: string;
  enabled: boolean;
  hasApiKey: boolean; // never expose the secret itself
  hasWebhookSecret: boolean;
}

const DEFAULTS: DeliverySettingsView = {
  provider: "manual",
  providerKey: "",
  deepLinkTemplate: "",
  apiBaseUrl: "",
  enabled: true,
  hasApiKey: false,
  hasWebhookSecret: false,
};

/** Current delivery config for the settings page (secrets reported as booleans). */
export async function getDeliverySettings(restaurantId: string): Promise<DeliverySettingsView> {
  try {
    const row = await tenantDb(restaurantId, (tx) =>
      tx.deliverySettings.findFirst({
        where: { restaurantId },
        select: {
          provider: true,
          providerKey: true,
          deepLinkTemplate: true,
          apiBaseUrl: true,
          credentialsEnc: true,
          enabled: true,
        },
      }),
    );
    if (!row) return DEFAULTS;
    let creds: ApiCredentials = {};
    try {
      creds = row.credentialsEnc ? decryptJson<ApiCredentials>(row.credentialsEnc) : {};
    } catch {
      /* ignore */
    }
    return {
      provider: (row.provider as DeliveryMode) ?? "manual",
      providerKey: row.providerKey ?? "",
      deepLinkTemplate: row.deepLinkTemplate ?? "",
      apiBaseUrl: row.apiBaseUrl ?? "",
      enabled: row.enabled,
      hasApiKey: !!creds.apiKey,
      hasWebhookSecret: !!creds.webhookSecret,
    };
  } catch {
    return DEFAULTS; // delivery_settings not migrated yet
  }
}

export type FormState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  provider: z.enum(["manual", "deeplink", "api"]),
  providerKey: z.string().trim().max(60).optional().default(""),
  deepLinkTemplate: z.string().trim().max(1000).optional().default(""),
  apiBaseUrl: z.string().trim().max(300).optional().default(""),
  apiKey: z.string().trim().max(500).optional().default(""),
  webhookSecret: z.string().trim().max(500).optional().default(""),
  enabled: z.boolean(),
});

export async function updateDeliverySettings(_prev: FormState, formData: FormData): Promise<FormState> {
  let restaurantId: string;
  try {
    ({ restaurantId } = await requireAdminAction());
  } catch {
    return { error: "Not allowed." };
  }

  const parsed = schema.safeParse({
    provider: formData.get("provider"),
    providerKey: formData.get("providerKey") ?? "",
    deepLinkTemplate: formData.get("deepLinkTemplate") ?? "",
    apiBaseUrl: formData.get("apiBaseUrl") ?? "",
    apiKey: formData.get("apiKey") ?? "",
    webhookSecret: formData.get("webhookSecret") ?? "",
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  if (d.provider === "deeplink" && !d.deepLinkTemplate) {
    return { error: "Add the provider's deep-link URL template." };
  }
  if (d.provider === "api" && !d.apiBaseUrl) {
    return { error: "Add the provider's API base URL." };
  }

  try {
    await tenantDb(restaurantId, async (tx) => {
      // Merge credentials: keep existing secrets when the field is left blank
      // (admins shouldn't have to re-enter on every edit), like the payments form.
      const existing = await tx.deliverySettings.findFirst({
        where: { restaurantId },
        select: { credentialsEnc: true },
      });
      let creds: ApiCredentials = {};
      if (existing?.credentialsEnc) {
        try {
          creds = decryptJson<ApiCredentials>(existing.credentialsEnc);
        } catch {
          /* ignore */
        }
      }
      if (d.apiKey) creds.apiKey = d.apiKey;
      if (d.webhookSecret) creds.webhookSecret = d.webhookSecret;
      const credentialsEnc = creds.apiKey || creds.webhookSecret ? encryptJson(creds) : null;

      const data = {
        provider: d.provider,
        providerKey: d.providerKey || null,
        deepLinkTemplate: d.deepLinkTemplate || null,
        apiBaseUrl: d.apiBaseUrl || null,
        credentialsEnc,
        enabled: d.enabled,
      };
      await tx.deliverySettings.upsert({
        where: { restaurantId },
        create: { restaurantId, ...data },
        update: data,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save.";
    if (/delivery_settings|relation|column/i.test(msg)) {
      return { error: "Needs a quick database update. Run the delivery migration in Supabase, then try again." };
    }
    return { error: msg };
  }

  revalidatePath("/admin/delivery");
  return { ok: true };
}
