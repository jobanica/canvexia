import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

/**
 * The agent application form, parsed. Pure so the rules are tested without a
 * browser or a database.
 */
export const PAYOUT_METHODS = ["GCash", "Maya", "Bank"] as const;

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(120),
    mobile: z.string().trim(),
    payoutMethod: z.enum(PAYOUT_METHODS, { message: "Choose how you want to be paid." }),
    bankName: z.string().trim().max(80).optional(),
    payoutAccountName: z.string().trim().min(2, "Enter the account name.").max(120),
    payoutAccountNumber: z
      .string()
      .trim()
      .regex(/^[0-9 -]{6,34}$/, "Enter the account or mobile number (digits only)."),
    agreementVersion: z.coerce.number().int().positive(),
    accept: z.literal("on", { message: "You must accept the agent agreement." }),
  })
  .superRefine((d, ctx) => {
    if (!/^639\d{9}$/.test(normalizePhone(d.mobile))) {
      ctx.addIssue({ code: "custom", path: ["mobile"], message: "Enter a PH mobile number, e.g. 0917 123 4567." });
    }
    if (d.payoutMethod === "Bank" && !d.bankName) {
      ctx.addIssue({ code: "custom", path: ["bankName"], message: "Enter the bank's name." });
    }
  });

export function parseApplication(form: Record<string, string | undefined>):
  | {
      ok: true;
      input: {
        name: string;
        mobile: string;
        payoutMethod: string;
        payoutAccountName: string;
        payoutAccountNumber: string;
      };
      agreementVersion: number;
    }
  | { ok: false; error: string } {
  const parsed = schema.safeParse(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  return {
    ok: true,
    agreementVersion: d.agreementVersion,
    input: {
      name: d.name,
      mobile: normalizePhone(d.mobile),
      payoutMethod: d.payoutMethod === "Bank" ? `Bank: ${d.bankName}` : d.payoutMethod,
      payoutAccountName: d.payoutAccountName,
      payoutAccountNumber: d.payoutAccountNumber.replace(/[\s-]+/g, ""),
    },
  };
}
