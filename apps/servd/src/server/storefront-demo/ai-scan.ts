import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * AI menu scanning for the demo-storefront builder: hand Claude a photo of a
 * printed menu and get back structured categories + items. Pure logic (no auth /
 * DB) — the calling action handles upload, auth and writing. Never throws.
 */

export interface ScanItem {
  name: string;
  description: string;
  price: number; // pesos
}
export interface ScanCategory {
  name: string;
  items: ScanItem[];
}
export type ScanResult = { ok: true; categories: ScanCategory[] } | { ok: false; error: string };

const schema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              description: z.string().trim().max(300).optional().default(""),
              price: z.coerce.number().min(0).max(1_000_000),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

const SYSTEM = `You digitize restaurant menus from photos. Output ONLY a JSON object, no prose, no code fences:
{"categories":[{"name":"<category>","items":[{"name":"<item>","description":"<short, or empty>","price":<number in pesos>}]}]}
Rules:
- Use the menu's own section headings as categories. If there are none, group items sensibly (e.g. "Mains", "Drinks").
- price is a plain number in Philippine pesos with no currency symbol or commas. If a price is unreadable, use 0.
- description: copy any printed description; otherwise leave it as "".
- Read EVERY visible item. Never invent items that aren't on the menu.
- Output the JSON object only.`;

export async function scanMenuMedia(media: { url: string; pdf: boolean }[]): Promise<ScanResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI scanning isn't configured on this server (no ANTHROPIC_API_KEY)." };
  }
  if (media.length === 0) return { ok: false, error: "Upload a menu photo or PDF first." };

  let text: string;
  try {
    const client = new Anthropic();
    // PDFs are document blocks; photos are image blocks. Claude fetches the URL.
    const blocks: Anthropic.ContentBlockParam[] = media.map((m) =>
      m.pdf
        ? { type: "document", source: { type: "url", url: m.url } }
        : { type: "image", source: { type: "url", url: m.url } },
    );
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [...blocks, { type: "text", text: "Digitize this menu into the JSON schema." }],
        },
      ],
    });
    text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `Couldn't read the menu: ${e.message}` : "Couldn't read the menu." };
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, error: "No menu items found — try a clearer photo." };

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, error: "Couldn't parse the menu — try a clearer photo." };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "No menu items found in that photo." };

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

  if (categories.length === 0) return { ok: false, error: "No menu items found in that photo." };
  return { ok: true, categories };
}
