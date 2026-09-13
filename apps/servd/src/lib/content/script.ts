import { z } from "zod";

/**
 * The shape of a generated short-form video script. Pure + client-safe so both
 * the Claude route (validation) and the UI (rendering) share one definition.
 */
export const hookSchema = z.object({
  visual: z.string(),
  audio: z.string(),
  textOverlay: z.string(),
});

export const bodyLineSchema = z.object({
  time: z.string(),
  action: z.string(),
  line: z.string(),
});

export const ctaSchema = z.object({
  verbal: z.string(),
  text: z.string(),
  action: z.string(),
});

export const scriptSchema = z.object({
  title: z.string().min(1),
  hook: hookSchema,
  body: z.array(bodyLineSchema).min(1),
  cta: ctaSchema.nullable(),
  production: z.object({
    music: z.string(),
    bRoll: z.string(),
    graphics: z.string(),
  }),
});

export type GeneratedScript = z.infer<typeof scriptSchema>;
export type ScriptType = "JAB" | "RIGHT_HOOK";

/** Strip ```json fences / surrounding prose down to the outermost JSON object. */
export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  // Remove code fences first if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

export type ParseResult =
  | { ok: true; script: GeneratedScript }
  | { ok: false; error: string };

/**
 * Parse model output into a validated script. Tolerant of fences/prose; returns
 * a typed error instead of throwing so a route can retry once then fail clean.
 */
export function safeParseScript(text: string): ParseResult {
  const json = extractJsonObject(text);
  if (!json) return { ok: false, error: "No JSON object found in the model output." };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "Model output was not valid JSON." };
  }
  const parsed = scriptSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Script failed validation." };
  }
  return { ok: true, script: parsed.data };
}

/**
 * Enforce the framework invariants regardless of what the model returned:
 *   - a JAB never carries a CTA (pure value, no ask),
 *   - a RIGHT_HOOK must keep its single CTA.
 * Returns the corrected script.
 */
export function enforceTypeInvariants(script: GeneratedScript, type: ScriptType): GeneratedScript {
  if (type === "JAB") return { ...script, cta: null };
  return script;
}

/** True if a jab is clean (no CTA). Used in tests + as a guard. */
export function jabHasNoCta(script: GeneratedScript): boolean {
  return script.cta == null;
}

/**
 * Render ONLY the spoken words, for a teleprompter: the hook line, every body
 * line, then the CTA line — separated by blank lines, no times/actions/overlays
 * or production notes. This is what the presenter reads aloud.
 */
export function scriptToTeleprompter(script: GeneratedScript): string {
  const blocks: string[] = [];
  if (script.hook.audio.trim()) blocks.push(script.hook.audio.trim());
  for (const b of script.body) {
    if (b.line.trim()) blocks.push(b.line.trim());
  }
  if (script.cta?.verbal.trim()) blocks.push(script.cta.verbal.trim());
  return blocks.join("\n\n");
}

/** Render a script as copy-pasteable Markdown (for the "Copy as Markdown" action). */
export function scriptToMarkdown(
  script: GeneratedScript,
  meta?: { type?: ScriptType; platform?: string; lengthSec?: number; pillar?: string },
): string {
  const lines: string[] = [];
  lines.push(`# ${script.title}`);
  if (meta) {
    const bits = [
      meta.type === "JAB" ? "Jab" : meta.type === "RIGHT_HOOK" ? "Right hook" : null,
      meta.platform,
      meta.lengthSec ? `${meta.lengthSec}s` : null,
      meta.pillar,
    ].filter(Boolean);
    if (bits.length) lines.push(`_${bits.join(" · ")}_`);
  }
  lines.push("");
  lines.push("## Hook (first 3s)");
  lines.push(`- **Visual:** ${script.hook.visual}`);
  lines.push(`- **Audio:** ${script.hook.audio}`);
  lines.push(`- **Text overlay:** ${script.hook.textOverlay}`);
  lines.push("");
  lines.push("## Body");
  for (const b of script.body) {
    lines.push(`- **${b.time}** — _${b.action}_ — ${b.line}`);
  }
  lines.push("");
  if (script.cta) {
    lines.push("## Call to action");
    lines.push(`- **Verbal:** ${script.cta.verbal}`);
    lines.push(`- **Text:** ${script.cta.text}`);
    lines.push(`- **Action:** ${script.cta.action}`);
    lines.push("");
  }
  lines.push("## Production");
  lines.push(`- **Music:** ${script.production.music}`);
  lines.push(`- **B-roll:** ${script.production.bRoll}`);
  lines.push(`- **Graphics:** ${script.production.graphics}`);
  return lines.join("\n");
}
