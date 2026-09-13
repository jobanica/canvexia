import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { pesosToCentavos } from "@/lib/money";
import { ALLOWED_MENU_DOC_TYPES } from "@/lib/validation/menu";
import { signImportReadUrls, removeImports } from "@/server/storage/menu-imports";

/**
 * The auth-free core of AI menu import: the prompt, the tolerant parser, and
 * the writer. Two very different callers share it —
 *
 *   • the admin flow (/admin/menu), authorized by a staff session, and
 *   • the public DIY builder (/build), authorized only by a build token
 *
 * — so authorization, rate limiting and revalidation stay with the callers and
 * only the menu-reading logic lives here. One prompt, one parser, one schema:
 * a fix to how prices or categories are read reaches both surfaces at once.
 *
 * Nothing here writes until a caller passes it an already-reviewed draft. The
 * model's output is never trusted straight into the menu.
 */

export const MAX_IMPORT_FILES = 6;

export interface ParsedItem {
  name: string;
  description: string;
  price: number; // pesos
}
export interface ParsedCategory {
  name: string;
  items: ParsedItem[];
}
export type AnalyzeResult =
  | { ok: true; categories: ParsedCategory[] }
  | { ok: false; error: string };

/** The description rule changes depending on the owner's toggle. */
function describeRule(generate: boolean): string {
  return generate
    ? `- description: copy any printed description verbatim. For items WITHOUT a printed description, WRITE a short, appetizing one (max ~14 words) based on the item name — natural and accurate, never invent specific ingredients you can't infer from the name.`
    : `- description: copy any printed description; otherwise use an empty string. Do NOT invent descriptions.`;
}

export function buildMenuSystemPrompt(generateDescriptions: boolean): string {
  return `You are a menu-digitizing assistant for a restaurant ordering platform in the Philippines (prices are in Philippine pesos, ₱).
You are given one or more photos or a PDF of a printed or handwritten food menu.
Extract every menu item you can read into structured data.

Rules:
- Group items under their printed category/section headings exactly as written (e.g. "Appetizers", "Mains", "Drinks").
- If a section is unlabeled, or items have no clear heading, INFER a sensible category for each item from what it is (e.g. "Appetizers", "Rice Meals", "Noodles", "Drinks", "Desserts"). Prefer a few well-named categories over one generic "Menu" bucket; only use "Menu" when an item is truly ambiguous.
- price: the item's peso price as a plain number (e.g. 149 or 149.5). Strip the ₱/PHP sign and any commas. If an item lists multiple sizes/prices, pick the smallest and append the size to the name (e.g. "Iced Tea (Regular)"). If a price is unreadable, use 0.
${describeRule(generateDescriptions)}
- Preserve the exact item names. Fix only obvious OCR glitches.
- Skip non-item text (addresses, phone numbers, "open daily", slogans).
- Order categories the way a customer would expect to browse them (starters → mains → sides → drinks → desserts).
- Return ONLY a JSON object, no prose, no code fence, of the form:
  {"categories":[{"name":"...","items":[{"name":"...","description":"...","price":0}]}]}`;
}

/** Validates the model's JSON before we trust it. */
const parsedMenuSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              description: z.string().trim().max(500).optional().default(""),
              price: z.coerce.number().min(0).max(1_000_000).catch(0),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

/** Re-validates a reviewed draft — the client may have edited every field. */
export const reviewedMenuSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Category name is required").max(80),
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              description: z.string().trim().max(500).optional().default(""),
              price: z.coerce.number().min(0).max(1_000_000),
            }),
          )
          .default([]),
      }),
    )
    .min(1, "Nothing to import"),
});

/** Every uploaded path must sit under this restaurant's own storage prefix. */
export function ownsImportPaths(restaurantId: string, paths: string[]): boolean {
  return paths.every((p) => p.startsWith(`${restaurantId}/`));
}

/** Type-checks the browser's declared MIME types before minting upload URLs. */
export function allowedImportTypes(types: unknown): types is string[] {
  return (
    Array.isArray(types) &&
    types.length > 0 &&
    types.length <= MAX_IMPORT_FILES &&
    types.every((t) => (ALLOWED_MENU_DOC_TYPES as readonly string[]).includes(t as string))
  );
}

/**
 * Reads uploaded menu media into a structured draft. Callers must already have
 * authorized `restaurantId` and checked the paths belong to it. Temp uploads
 * are removed either way — they're only needed for this one call.
 */
export async function analyzeMenuFor(
  restaurantId: string,
  paths: string[],
  generateDescriptions: boolean,
): Promise<AnalyzeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI menu reading isn't set up on this server." };
  }
  if (paths.length === 0) return { ok: false, error: "Add at least one menu photo or PDF." };
  if (paths.length > MAX_IMPORT_FILES) {
    return { ok: false, error: `Please upload at most ${MAX_IMPORT_FILES} files at a time.` };
  }
  if (!ownsImportPaths(restaurantId, paths)) {
    return { ok: false, error: "That upload couldn't be verified. Please try again." };
  }

  let text: string;
  try {
    // Signed read URLs Anthropic fetches directly — a PDF is a document block,
    // photos are image blocks.
    const urls = await signImportReadUrls(paths);
    const blocks: Anthropic.ContentBlockParam[] = urls.map((url, i) =>
      paths[i].toLowerCase().endsWith(".pdf")
        ? { type: "document", source: { type: "url", url } }
        : { type: "image", source: { type: "url", url } },
    );

    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      system: buildMenuSystemPrompt(generateDescriptions),
      messages: [
        {
          role: "user",
          content: [
            ...blocks,
            { type: "text", text: "Digitize this menu into the JSON schema described." },
          ],
        },
      ],
    });
    text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Couldn't read the menu: ${e.message}` : "Couldn't read the menu.",
    };
  } finally {
    await removeImports(paths); // temp uploads aren't needed once analyzed
  }

  return parseMenuText(text);
}

/** Tolerantly parse the model's JSON into a clean, validated draft. */
export function parseMenuText(text: string): AnalyzeResult {
  // The model may wrap the object in prose or a code fence.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: "Couldn't find any menu items. Try a clearer photo." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, error: "Couldn't read the menu. Please try a clearer picture." };
  }

  const parsed = parsedMenuSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Couldn't find any menu items in that file." };
  }

  // Drop empty categories and round prices for a clean draft.
  const categories = parsed.data.categories
    .map((c) => ({
      name: c.name,
      items: c.items.map((i) => ({
        name: i.name,
        description: i.description ?? "",
        price: Math.round(i.price * 100) / 100,
      })),
    }))
    .filter((c) => c.items.length > 0);

  if (categories.length === 0) {
    return { ok: false, error: "Couldn't find any menu items in that file." };
  }
  return { ok: true, categories };
}

export type CreatedItem = { id: string; name: string };
export interface WriteSummary {
  categories: number;
  created: CreatedItem[];
}

/**
 * Writes a reviewed draft into a menu, reusing existing categories and skipping
 * items already present (case-insensitive), so a re-import doesn't duplicate.
 *
 * The transaction runner is injected because the two callers need different
 * database contexts: the admin flow runs RLS-constrained under the staff's
 * tenant, the anonymous builder runs in the system context.
 */
export async function writeReviewedMenu(
  restaurantId: string,
  draft: z.infer<typeof reviewedMenuSchema>,
  run: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>,
): Promise<WriteSummary> {
  let categories = 0;
  const created: CreatedItem[] = [];

  await run(async (tx) => {
    // Existing categories, lower-cased name → id, so a re-import reuses them.
    const existing = await tx.category.findMany({
      where: { restaurantId },
      select: { id: true, name: true },
    });
    const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));
    let sortOrder = existing.length;

    for (const cat of draft.categories) {
      const items = cat.items.filter((i) => i.name.trim().length > 0);
      if (items.length === 0) continue;

      const key = cat.name.trim().toLowerCase();
      let categoryId = byName.get(key);
      if (!categoryId) {
        const createdCat = await tx.category.create({
          data: { restaurantId, name: cat.name.trim(), sortOrder: sortOrder++ },
          select: { id: true },
        });
        categoryId = createdCat.id;
        byName.set(key, categoryId);
        categories++;
      }

      const present = new Set(
        (await tx.menuItem.findMany({ where: { categoryId }, select: { name: true } })).map((i) =>
          i.name.trim().toLowerCase(),
        ),
      );

      for (const item of items) {
        const nameKey = item.name.trim().toLowerCase();
        if (present.has(nameKey)) continue;
        present.add(nameKey);
        const name = item.name.trim();
        const row = await tx.menuItem.create({
          data: {
            restaurantId,
            categoryId,
            name,
            description: item.description?.trim() || null,
            price: pesosToCentavos(item.price),
            isAvailable: true,
          },
          select: { id: true },
        });
        created.push({ id: row.id, name });
      }
    }
  });

  return { categories, created };
}
