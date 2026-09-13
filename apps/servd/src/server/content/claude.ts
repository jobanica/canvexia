import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  safeParseScript,
  enforceTypeInvariants,
  type GeneratedScript,
  type ScriptType,
} from "@/lib/content/script";

/**
 * Server-side Claude calls for the Content Engine. The API key stays on the
 * server (the SDK reads ANTHROPIC_API_KEY); never construct this client-side.
 *
 * Model split is configurable via env so batch runs can use a cheaper model:
 *   SERVD_CONTENT_MODEL        — single generation (default Sonnet 4.6)
 *   SERVD_CONTENT_BATCH_MODEL  — batch generation (default Haiku 4.5)
 */
const MODEL = process.env.SERVD_CONTENT_MODEL ?? "claude-sonnet-4-6";
const BATCH_MODEL = process.env.SERVD_CONTENT_BATCH_MODEL ?? "claude-haiku-4-5";
const MAX_TOKENS = 1200;

/** Whether generation is available (API key configured). */
export function contentEngineEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface GenerateOpts {
  systemPrompt: string;
  pillarName: string;
  pillarGuidance: string;
  type: ScriptType;
  topic: string;
  platform: string;
  lengthSec: number;
  recentTitles: string[];
  batch?: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type GenerateResult =
  | { ok: true; script: GeneratedScript; usage: Usage; model: string }
  | { ok: false; error: string; usage: Usage; model: string };

function buildUserMessage(opts: GenerateOpts): string {
  return [
    `Type: ${opts.type}`,
    `Pillar: ${opts.pillarName} — ${opts.pillarGuidance}`,
    `Topic/angle: ${opts.topic || "you choose a strong one"}`,
    `Platform: ${opts.platform}. Target length: ${opts.lengthSec}s.`,
    opts.recentTitles.length ? `Avoid repeating: ${opts.recentTitles.join("; ")}` : "",
    `Return ONLY the JSON object. No markdown, no fences.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate one script. Prompt-caches the (large, stable) system prompt for batch
 * savings, validates the JSON, and retries ONCE with a stricter nudge before
 * giving up — so malformed output never crashes the caller.
 */
export async function generateScript(opts: GenerateOpts): Promise<GenerateResult> {
  const model = opts.batch ? BATCH_MODEL : MODEL;
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };

  if (!contentEngineEnabled()) {
    return { ok: false, error: "The Claude API key is not configured on the server.", usage, model };
  }

  const client = new Anthropic();
  const baseMsg = buildUserMessage(opts);

  const call = async (extra: string): Promise<string> => {
    const res = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: extra ? `${baseMsg}\n\n${extra}` : baseMsg }],
    });
    usage = {
      inputTokens: usage.inputTokens + (res.usage?.input_tokens ?? 0),
      outputTokens: usage.outputTokens + (res.usage?.output_tokens ?? 0),
    };
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  };

  try {
    let parsed = safeParseScript(await call(""));
    if (!parsed.ok) {
      // One retry with an explicit "valid JSON only" instruction.
      parsed = safeParseScript(
        await call("Your previous reply was not valid JSON. Reply with ONLY the JSON object — no prose, no code fences."),
      );
    }
    if (!parsed.ok) return { ok: false, error: parsed.error, usage, model };
    return { ok: true, script: enforceTypeInvariants(parsed.script, opts.type), usage, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Generation failed.", usage, model };
  }
}
