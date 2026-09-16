/**
 * What an inbound SMS means.
 *
 *  - "confirm" → completes a double opt-in
 *  - "stop"    → opt out, immediately and everywhere
 *  - "other"   → a real message, for the inbox
 *
 * MATCHING IS DELIBERATELY GENEROUS ON STOP AND STRICT ON CONFIRM. Getting a
 * STOP wrong means texting somebody who told you to stop, which is a complaint
 * and a breach; getting a CONFIRM wrong means somebody has to reply once more.
 * Those costs are not symmetrical, so the rules are not either.
 */
export type ReplyIntent = "confirm" | "stop" | "other";

const CONFIRM = new Set(["yes", "y", "oo", "confirm", "sige", "go"]);

/**
 * Every word that means stop.
 *
 * TAGALOG IS NOT OPTIONAL HERE. "TIGIL" and "ALIS" are what a Filipino
 * recipient actually texts back, and an English-only list means their opt-out
 * silently becomes an inbox message that nobody treats as a withdrawal of
 * consent. The brief names both; "hinto" and "ayaw" are included for the same
 * reason — somebody who texts either has plainly said no.
 */
const STOP = new Set([
  "stop",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "wala",
  "tigil",
  "alis",
  "hinto",
  "ayaw",
]);

/**
 * Two-word forms, checked before the first word.
 *
 * "OPT OUT" is the phrase the brief names and it is two words, so a first-word
 * match sees "opt" and files it as a question. "TAMA NA" ("enough") is the same
 * shape in Tagalog.
 */
const STOP_PHRASES = ["opt out", "optout", "opt-out", "tama na", "stop all"];

export function classifyReply(text: string): ReplyIntent {
  const cleaned = text.trim().toLowerCase().replace(/[^a-z\s-]/g, "");
  if (!cleaned) return "other";

  const collapsed = cleaned.replace(/\s+/g, " ");
  // Checked against the START of the message rather than the whole of it: "opt
  // out please" and "stop all texts" are both plainly an opt-out.
  for (const phrase of STOP_PHRASES) {
    if (collapsed === phrase || collapsed.startsWith(`${phrase} `)) return "stop";
  }

  const first = collapsed.split(" ")[0];
  if (!first) return "other";
  if (STOP.has(first)) return "stop";
  if (CONFIRM.has(first)) return "confirm";
  return "other";
}

/** The words this build treats as an opt-out. Exported so a screen can say so. */
export const STOP_WORDS: string[] = [...STOP, ...STOP_PHRASES].sort();
