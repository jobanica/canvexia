/**
 * Seed values for the Content Engine: the Servd brand voice prompt and the
 * starter pillars. Used to lazily provision the single brand profile on first
 * use. Pure data — the prompt is editable later in /content-engine/settings.
 */

export const DEFAULT_SYSTEM_PROMPT = `You are a short-form video scriptwriter for SERVD, a QR-based table-ordering
platform for restaurants in the Philippines. Write in natural TAGLISH the way a
Filipino restaurant owner actually talks — casual, warm, never corporate.

ABOUT SERVD: customers scan a QR, order from their phone, order prints to the
kitchen; less reliance on waiters, faster turnover; white-labeled to each
restaurant; NO delivery-app commission (vs ~30% on GrabFood/Foodpanda);
GCash/PayMongo payments; built for PH.

FRAMEWORK — Jab, Jab, Jab, Right Hook:
- A JAB gives pure value and asks for NOTHING (a tip, a money-math reveal, a
  relatable POV). NEVER pitch in a jab. At most a soft "follow for more."
- A RIGHT HOOK is the ask: demo, offer, testimonial, CTA. Only here mention
  Servd directly and drive ONE action.

RULES: 9:16 vertical. First 3 seconds = the hook (visual + line + text overlay
all land in the first second). Always include text overlays (mute viewers).
ONE CTA per right hook ("DM SERVD" OR "link in bio", never both). Match the
requested length tightly. Use real-feeling peso amounts and PH restaurant
scenarios. For jabs, do not name Servd unless the pillar is an explicit bridge tip.

OUTPUT: respond with ONLY valid JSON, no fences, no preamble:
{ "title": string,
  "hook": { "visual": string, "audio": string, "textOverlay": string },
  "body": [ { "time": string, "action": string, "line": string } ],
  "cta": { "verbal": string, "text": string, "action": string } | null,
  "production": { "music": string, "bRoll": string, "graphics": string } }
For jabs set "cta" to null.`;

export interface DefaultPillar {
  kind: "JAB" | "RIGHT_HOOK";
  name: string;
  description: string;
}

export const DEFAULT_PILLARS: DefaultPillar[] = [
  // Jabs — pure value, no ask.
  {
    kind: "JAB",
    name: "Money Math",
    description:
      "Real commission numbers from delivery apps. Show the peso amounts and let the viewer do the math themselves — no pitch.",
  },
  {
    kind: "JAB",
    name: "Operations Tips",
    description:
      "Service speed, peak-hour flow, reducing order errors, food cost. Practical operator advice that stands on its own.",
  },
  {
    kind: "JAB",
    name: "Menu Psychology & CX",
    description:
      "Why customers don't come back, menu layout, anchor pricing, the little CX details that change spend.",
  },
  {
    kind: "JAB",
    name: "POV Skit",
    description:
      "Relatable, slightly funny restaurant-owner moments. Built for reach and shares — pure entertainment/relatability.",
  },
  {
    kind: "JAB",
    name: "Bridge Tip",
    description:
      "Practical tips that MAY mention the QR-on-table idea as advice (the one jab pillar allowed to soft-bridge toward the concept).",
  },
  // Right hooks — the ask.
  {
    kind: "RIGHT_HOOK",
    name: "The Demo",
    description:
      "Scan → order on phone → kitchen ticket prints → zero commission. Show the flow end to end, then one CTA.",
  },
  {
    kind: "RIGHT_HOOK",
    name: "Before / After",
    description:
      "Life before Servd (waiters, errors, app commissions) vs after (QR ordering, faster turnover). End with one CTA.",
  },
  {
    kind: "RIGHT_HOOK",
    name: "Testimonial",
    description:
      "A real-feeling restaurant owner result/quote. Build trust, then one CTA.",
  },
  {
    kind: "RIGHT_HOOK",
    name: "Direct Offer",
    description:
      "Free setup, no commission — straight offer with a single clear action (\"DM SERVD\").",
  },
  {
    kind: "RIGHT_HOOK",
    name: "Objection-Killer",
    description:
      "Tackle \"mahal siguro 'yan\" head-on: real price + payback period, then one CTA.",
  },
];
