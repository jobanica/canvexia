"use server";

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { hasFeature } from "@/server/billing/feature-gate";
import {
  MAX_IMPORT_FILES,
  allowedImportTypes,
  analyzeMenuFor,
  reviewedMenuSchema,
  writeReviewedMenu,
  type AnalyzeResult,
  type CreatedItem,
  type ParsedCategory,
  type ParsedItem,
} from "@/server/menu/menu-scan";
import {
  createImportUploadTargets,
  MENU_IMPORT_BUCKET,
  type UploadTarget,
} from "@/server/storage/menu-imports";

/**
 * AI menu import for the ADMIN menu screen — snap a photo of a printed menu and
 * let Claude turn it into structured categories + items the owner reviews and
 * imports in one tap.
 *
 * Steps so the owner stays in control:
 *   0. createMenuImportUploads — signed URLs; the browser uploads to storage.
 *   1. analyzeMenuMedia — vision model reads the file(s) → structured draft.
 *   2. importParsedMenu — writes the (possibly edited) draft to the menu.
 *
 * This file is the authorization + revalidation layer only; the prompt, parser
 * and writer live in menu-scan.ts, shared with the public DIY builder.
 */

export type { AnalyzeResult, CreatedItem, ParsedCategory, ParsedItem };

const MAX_FILES = MAX_IMPORT_FILES;

export type CreateUploadsResult =
  | { ok: true; bucket: string; targets: UploadTarget[] }
  | { ok: false; error: string };

/**
 * Step 0 — hand the browser short-lived signed upload URLs so it can send the
 * files straight to Supabase Storage, bypassing the serverless body limit.
 */
export async function createMenuImportUploads(types: string[]): Promise<CreateUploadsResult> {
  const { restaurantId } = await requireManagerAction();

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI menu import isn't configured on this server." };
  }
  if (!(await hasFeature(restaurantId, "aiMenuImport"))) {
    return { ok: false, error: "AI menu import is available on the Growth and Business plans. Upgrade to use it." };
  }
  if (!allowedImportTypes(types)) {
    return {
      ok: false,
      error: `Add 1–${MAX_FILES} menu files — JPG, PNG, WebP photos or a PDF.`,
    };
  }

  try {
    const targets = await createImportUploadTargets(restaurantId, types);
    return { ok: true, bucket: MENU_IMPORT_BUCKET, targets };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Couldn't prepare the upload: ${e.message}` : "Couldn't prepare the upload.",
    };
  }
}

/** Step 1 — read the uploaded photo(s)/PDF from storage into a menu draft. */
export async function analyzeMenuMedia(input: {
  paths: string[];
  generateDescriptions: boolean;
}): Promise<AnalyzeResult> {
  const { restaurantId } = await requireManagerAction();

  if (!(await hasFeature(restaurantId, "aiMenuImport"))) {
    return { ok: false, error: "AI menu import is available on the Growth and Business plans. Upgrade to use it." };
  }

  const paths = Array.isArray(input?.paths)
    ? input.paths.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  return analyzeMenuFor(restaurantId, paths, !!input?.generateDescriptions);
}

export type ImportResult =
  | { ok: true; categories: number; items: number; created: CreatedItem[] }
  | { ok: false; error: string };

/** Step 2 — write the reviewed draft into the menu (idempotent-ish). */
export async function importParsedMenu(input: unknown): Promise<ImportResult> {
  const { restaurantId } = await requireManagerAction();

  const parsed = reviewedMenuSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid menu data." };
  }

  try {
    const { categories, created } = await writeReviewedMenu(restaurantId, parsed.data, (fn) =>
      tenantDb(restaurantId, fn),
    );
    revalidatePath("/admin/menu");
    return { ok: true, categories, items: created.length, created };
  } catch {
    return { ok: false, error: "Couldn't save the menu. Please try again." };
  }
}
