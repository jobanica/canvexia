import { z } from "zod";

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
 * A Philippine mobile number, stored one way.
 *
 * HQ will ring these. The same person types 0917, +63 917, 63917 and
 * (0917) 123-4567, and four spellings of one number is four rows that look like
 * four people and a duplicate check that never fires. So the number is
 * normalised to +639XXXXXXXXX on the way in, and the stored column has exactly
 * one shape.
 *
 * Only mobiles. A landline ("082 224 1234") cannot receive the SMS the
 * programme runs on, and accepting one means finding out weeks later, from
 * someone who never got a message. PH mobiles are 10 digits beginning with 9.
 */
export function normalizeMobile(raw: string): string | null {
  // Keep the leading + if it is there; drop every separator a person might
  // type — spaces, dashes, dots, parentheses, and the non-breaking space that
  // arrives when a number is pasted out of a chat app.
  const cleaned = raw.replace(/[\s ().\-]/g, "");
  if (!/^\+?\d+$/.test(cleaned)) return null;

  let digits = cleaned.replace(/^\+/, "");

  // 00 is the international access prefix dialled from a PH landline.
  if (digits.startsWith("00")) digits = digits.slice(2);
  // 63 = the country code, with or without the +.
  if (digits.startsWith("63")) digits = digits.slice(2);
  // 0 = the national trunk prefix, which is dropped in the international form.
  else if (digits.startsWith("0")) digits = digits.slice(1);

  // What must remain is the subscriber number: 9 followed by nine digits.
  if (!/^9\d{9}$/.test(digits)) return null;
  return `+63${digits}`;
}

export const Mobile = z
  .string()
  .trim()
  .min(1, "Enter your mobile number so we can reach you.")
  .transform((v, ctx) => {
    const normal = normalizeMobile(v);
    if (!normal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "That doesn't look like a PH mobile number — 0917 123 4567 or +63 917 123 4567.",
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
