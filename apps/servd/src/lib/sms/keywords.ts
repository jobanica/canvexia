/**
 * Classifies an inbound SMS reply for the double-opt-in / opt-out flow.
 *
 *  - "confirm" → completes double opt-in (marketing consent = confirmed)
 *  - "stop"    → immediate opt-out (never message again)
 *  - "other"   → ignore
 *
 * Matching is case/whitespace-insensitive and checks the first word, so
 * "YES please" or "stop." still work.
 */
export type ReplyIntent = "confirm" | "stop" | "other";

const CONFIRM = new Set(["yes", "y", "oo", "confirm", "sige", "go"]);
const STOP = new Set(["stop", "unsubscribe", "cancel", "end", "quit", "wala"]);

export function classifyReply(text: string): ReplyIntent {
  const first = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)[0];
  if (!first) return "other";
  if (STOP.has(first)) return "stop";
  if (CONFIRM.has(first)) return "confirm";
  return "other";
}
