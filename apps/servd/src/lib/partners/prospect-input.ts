import { z } from "zod";
import { MOBILE_HELP, isProductId, normalizeMobile } from "@servd/core";

/**
 * What the pipeline forms are allowed to say.
 *
 * Two shapes, and the difference between them is the whole security story of
 * this phase:
 *
 *   ProspectInput  — a signed-in partner adding a business they walked into.
 *   LeadInput      — a STRANGER on a public page, unauthenticated.
 *
 * The public one asks for less, caps harder, and is what the rate limiter and
 * the server action guard. A `"use server"` file may only export async
 * functions, so both live here where they can be tested.
 */

export const STAGES = ["lead", "contacted", "demo_booked", "trial", "paid", "lost"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  lead: "Lead",
  contacted: "Contacted",
  demo_booked: "Demo booked",
  trial: "Trial",
  paid: "Paid",
  lost: "Lost",
};

export const SOURCES = ["walk_in", "referral", "lead_form", "ads", "other"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = {
  walk_in: "Walk-in",
  referral: "Referral",
  lead_form: "Lead form",
  ads: "Ads",
  other: "Other",
};

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

/** Trim, and treat an empty box as "not answered" rather than as "". */
const Optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .default(null);

const Required = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max);

/**
 * A mobile number, optional but normalised when given.
 *
 * Optional because a partner writing down a shop they just passed may only have
 * a name and a street. Normalised because the moment there IS a number, four
 * spellings of it is four rows that look like four businesses.
 */
const OptionalMobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const normal = normalizeMobile(v);
    if (!normal) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MOBILE_HELP });
      return z.NEVER;
    }
    return normal;
  })
  .default("");

const ProductId = z
  .string()
  .trim()
  .min(1, "Which product are you pitching?")
  .refine(isProductId, "That is not a product we sell.");

/**
 * A date the partner picked, as a form sends it: "2026-07-14" or "".
 *
 * Parsed as UTC midnight rather than local, because `new Date("2026-07-14")`
 * already is UTC midnight while `new Date("2026/07/14")` is local — mixing them
 * puts a follow-up a day out for half the year.
 */
const OptionalDate = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "That date didn't parse." });
      return z.NEVER;
    }
    return d;
  })
  .default("");

export const ProspectInput = z.object({
  businessName: Required(160, "Give the business a name."),
  ownerName: Optional(120),
  mobile: OptionalMobile,
  address: Optional(300),
  productId: ProductId,
  source: z.enum(SOURCES).default("other"),
  nextFollowUpAt: OptionalDate,
  notes: Optional(2000),
  assignedToId: Optional(64),
});

export type ProspectInputValues = z.infer<typeof ProspectInput>;

/**
 * The PUBLIC lead form.
 *
 * Deliberately smaller than the partner's own form. Everything a stranger can
 * write into this table is here, and everything absent is a field only a
 * signed-in partner can set — stage, assignment, follow-up date, and the notes
 * field, which is 2000 characters and would otherwise be an open text dump on a
 * public endpoint.
 *
 * Mobile is REQUIRED here and optional for a partner: the partner already has
 * the shop in front of them, a stranger is asking to be called back.
 */
export const LeadInput = z.object({
  businessName: Required(160, "What's the business called?"),
  ownerName: Required(120, "Who should we ask for?"),
  mobile: z
    .string()
    .trim()
    .min(1, "We need a mobile number to call you back.")
    .transform((v, ctx) => {
      const normal = normalizeMobile(v);
      if (!normal) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: MOBILE_HELP });
        return z.NEVER;
      }
      return normal;
    }),
  address: Optional(200),
  productId: ProductId,
  /** One short line, not the partner form's 2000-character notes field. */
  message: Optional(500),
});

export type LeadInputValues = z.infer<typeof LeadInput>;

/**
 * The first message worth showing, or null.
 *
 * One message, not a list: these forms are short enough that fixing the first
 * problem and pressing the button again is faster to read than a wall of red.
 */
export function firstMessage(error: z.ZodError): string {
  for (const issue of error.issues) {
    const m = issue.message;
    if (m && !/^(Required|Invalid|Expected)\b/.test(m)) return m;
  }
  return "Check the form — something didn't look right.";
}
