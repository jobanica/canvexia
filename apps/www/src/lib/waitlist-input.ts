import { z } from "zod";
import { normalizeMobile as normalize, MOBILE_HELP } from "@servd/core";

/**
 * What the waitlist form is allowed to say.
 *
 * Separate from the server action for the same reason Resceta's settings schema
 * is: a `"use server"` file may only export async functions, so a schema
 * declared there cannot be tested. This one decides whether a stranger's
 * contact details are usable, which is not a thing to take on trust.
 *
 * Nothing here is a browser convenience. `required` on an input is a hint any
 * POST can ignore; the refusal lives in this file.
 */

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
 * The PH mobile normaliser moved to `packages/core/src/ph/mobile.ts` when the
 * partner pipeline needed the same rule — two apps, one implementation, the
 * same argument D36 made for provisioning. Re-exported here so this module's
 * consumers and its tests do not have to care where it lives.
 */
export { normalizeMobile, MOBILE_HELP } from "@servd/core";

export const Mobile = z
  .string()
  .trim()
  .min(1, "Enter your mobile number so we can reach you.")
  .transform((v, ctx) => {
    const normal = normalize(v);
    if (!normal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: MOBILE_HELP,
      });
      return z.NEVER;
    }
    return normal;
  });

/**
 * The hours answers.
 *
 * The VALUES are Prisma's names for the WaitlistHours enum, not the labels the
 * column stores. The schema maps them — `under5 @map("<5")` — so Postgres holds
 * '<5' while the client only ever says `under5`, and a form posting the literal
 * '<5' is rejected by the client before it reaches the database. That is worth
 * spelling out because the strings look interchangeable and are not; the
 * compiler is what caught it, and the test below is what keeps it caught.
 */
export const HOURS_OPTIONS = [
  { value: "under5", label: "Under 5 hours a week" },
  { value: "h5to10", label: "5–10 hours a week" },
  { value: "h10to20", label: "10–20 hours a week" },
  { value: "h20plus", label: "More than 20 hours a week" },
] as const;

export const HOURS_VALUES = ["under5", "h5to10", "h10to20", "h20plus"] as const;

/**
 * "Have you sold anything before?" — an answer, not a default.
 *
 * The brief makes this required, and the reason is worth stating: a radio pair
 * that has not been touched submits NOTHING, so a permissive cast records "no"
 * for someone who never said no. That is a wrong answer written into a column
 * about a stranger, and nobody would ever find it. An unanswered question is
 * refused instead.
 *
 * "false" is also the one string that reads as truthy to `Boolean(v)`, which is
 * why this is an explicit list rather than a cast.
 */
const YES = new Set(["yes", "true", "1"]);
const NO = new Set(["no", "false", "0"]);

const SoldBefore = z
  .union([z.string(), z.boolean(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (typeof v === "boolean") return v;
    const s = (v ?? "").toString().trim().toLowerCase();
    if (YES.has(s)) return true;
    if (NO.has(s)) return false;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tell us whether you've sold something before — either answer is fine.",
    });
    return z.NEVER;
  });

export const WaitlistInput = z.object({
  fullName: Required(120, "Enter your full name."),
  email: Required(200, "Enter your email address.").pipe(
    z.string().email("Check the email address — we reply there."),
  ),
  mobile: Mobile,
  city: Required(120, "Which city do you want to run?"),
  province: Optional(120),
  currentWork: Optional(200),
  hoursPerWeek: z.enum(HOURS_VALUES, {
    errorMap: () => ({ message: "Tell us roughly how many hours a week you can give this." }),
  }),
  soldBefore: SoldBefore,
  soldWhat: Optional(300),
  howHeard: Optional(200),
});

export type WaitlistInputValues = z.infer<typeof WaitlistInput>;

/**
 * The first message worth showing, or null.
 *
 * One message, not a list: the form is short enough that fixing the first
 * problem and pressing the button again is faster to read than a wall of red.
 * Zod's own message is used where it was written for a person; its generic
 * "Required"/"Invalid" strings are not shown to anyone.
 */
export function firstMessage(error: z.ZodError): string {
  for (const issue of error.issues) {
    const m = issue.message;
    if (m && !/^(Required|Invalid|Expected)\b/.test(m)) return m;
  }
  return "Check the form — something didn't look right.";
}
