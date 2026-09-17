import { z } from "zod";

/**
 * What a supplier row may contain.
 *
 * Lives in `lib/` rather than beside the action because a `"use server"` module
 * may only export async functions — the same reason `product-input.ts` exists.
 * It also means the shape can be tested without a session.
 *
 * EMPTY IS NULL, NOT "". A phone number that is the empty string sorts, prints
 * and compares as a value; null is the absence of one, and the screen renders
 * it as an em dash rather than a blank the reader mistakes for a missing pixel.
 */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

export const SupplierInput = z.object({
  name: z.string().trim().min(1, "A supplier needs a name.").max(200),
  contactPerson: optional(200),
  phone: optional(40),
  // Not `z.string().email()`: a distributor's "email" here is often two
  // addresses, or a note. Refusing to save it because it is not RFC-shaped
  // loses the contact detail the pharmacy actually has.
  email: optional(200),
  address: optional(400),
  notes: optional(2000),
});

export type SupplierInputValues = z.infer<typeof SupplierInput>;
