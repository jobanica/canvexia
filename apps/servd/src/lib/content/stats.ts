/**
 * Pure helpers for library performance fields + status. Shared by the inline
 * editor (client) and the server action (validation).
 */

export const SCRIPT_STATUSES = ["IDEA", "SCRIPTED", "FILMED", "POSTED"] as const;
export type ScriptStatus = (typeof SCRIPT_STATUSES)[number];

export function isScriptStatus(s: unknown): s is ScriptStatus {
  return typeof s === "string" && (SCRIPT_STATUSES as readonly string[]).includes(s);
}

/** Normalise a performance metric: blank/invalid → null, else a non-negative int. */
export function cleanMetric(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Prompt fragment that turns a winning script into a fresh variation. */
export function buildRemixTopic(originalTitle: string, variant: number): string {
  return (
    `Remix this winning idea into a fresh take (variation ${variant}): "${originalTitle}". ` +
    `Keep the core angle but use a brand-new hook, different opening visual, and new lines.`
  );
}
