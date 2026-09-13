"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { parseBrandConfig, validateBrandConfig, type PartnerBrandConfig } from "@servd/core";
import { partnerDb } from "@/server/tenancy/scoped-db";
import { getCurrentPartner } from "@/server/partners/auth";

export type BrandState = { ok?: boolean; message?: string; error?: string } | null;

/**
 * A partner editing their own brand.
 *
 * Scoped with partnerDb() rather than systemDb(), even though the partner id
 * comes from the session and the update names it explicitly. Two reasons, and
 * the second is the real one:
 *
 *   1. It is the narrowest scope that can do the job, which is the rule.
 *   2. systemDb() would make `where: { id }` the only thing standing between
 *      this action and every partner row on the platform. Under partnerDb the
 *      policy refuses a write to anybody else's row outright, so a future bug in
 *      how the id is derived is a failed update rather than one partner
 *      rebranding another.
 */
export async function savePartnerBrand(
  _prev: BrandState,
  formData: FormData,
): Promise<BrandState> {
  const partner = await getCurrentPartner();
  if (!partner || partner.status !== "approved") {
    return { error: "Your partner account isn't approved yet." };
  }

  const field = (name: keyof PartnerBrandConfig) =>
    String(formData.get(name) ?? "").trim() || undefined;

  const draft: PartnerBrandConfig = {
    displayName: field("displayName"),
    legalName: field("legalName"),
    logoUrl: field("logoUrl"),
    logoDarkUrl: field("logoDarkUrl"),
    faviconUrl: field("faviconUrl"),
    primaryColor: field("primaryColor"),
    accentColor: field("accentColor"),
    supportEmail: field("supportEmail"),
    supportPhone: field("supportPhone"),
    supportUrl: field("supportUrl"),
    legalFooter: field("legalFooter"),
  };

  const checked = validateBrandConfig(draft);
  if (!checked.ok) return { error: checked.errors[0] };

  try {
    await partnerDb(partner.id, (tx) =>
      tx.partner.update({
        where: { id: partner.id },
        // parseBrandConfig has already dropped empty strings, so clearing a
        // field removes the key rather than storing "" — which resolveBrand
        // would otherwise treat as a deliberate blank and render as nothing.
        // The cast is the interface mismatch, not a shrug: PartnerBrandConfig is
        // a closed set of optional string fields, and Prisma's InputJsonObject
        // wants an index signature. Spreading produces the plain object it is
        // asking for; validateBrandConfig has already decided the contents.
        data: { brandConfig: { ...checked.config } as Prisma.InputJsonObject },
      }),
    );
  } catch (e) {
    console.error("savePartnerBrand failed", e);
    return { error: "Couldn't save your brand settings." };
  }

  revalidatePath("/partner/brand");
  revalidatePath("/partner");
  return { ok: true, message: "Brand saved." };
}

/**
 * The partner's stored brand, plus the brand mode HQ set for them.
 *
 * Read here rather than added to CurrentPartner: that select resolves identity
 * on every partner request, and naming a hand-run-migration column in it would
 * mean a database one migration behind cannot log a partner in at all — the
 * failure the same comment warns about on the super-admin identity query.
 */
export async function getPartnerBrand(
  partnerId: string,
): Promise<{ config: PartnerBrandConfig; brandMode: string }> {
  try {
    const row = await partnerDb(partnerId, (tx) =>
      tx.partner.findUnique({
        where: { id: partnerId },
        select: { brandConfig: true, brandMode: true },
      }),
    );
    return {
      config: parseBrandConfig(row?.brandConfig),
      brandMode: row?.brandMode ?? "powered_by",
    };
  } catch {
    // Columns not migrated yet — an unbranded form, not a broken page.
    return { config: {}, brandMode: "powered_by" };
  }
}
