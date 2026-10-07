import { z } from "zod";

/**
 * Portal → product callbacks. Signed exactly like product → portal requests
 * (signing.ts), with the product's own secret, so a product verifies them with
 * the same function it signs with.
 *
 * Delivered at least once: the product dedupes on event_id.
 */
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const base = {
  event_id: z.string().min(8).max(200),
  occurred_at: z.string().datetime({ offset: true }),
};
const customer = { external_customer_id: z.string().min(1).max(200) };

export const portalCallbackSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("payment.confirmed"),
    data: z.object({
      ...customer,
      bank_reference: z.string(),
      payment_type: z.enum(["activation", "monthly"]),
      months_covered: z.number().int().min(1),
      billing_month_start: month.nullable(),
      amount: z.number().int(),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("payment.rejected"),
    data: z.object({ ...customer, bank_reference: z.string(), reason: z.string() }),
  }),
  z.object({
    ...base,
    type: z.literal("payment.reversed"),
    data: z.object({ ...customer, bank_reference: z.string(), reason: z.string() }),
  }),
  z.object({
    ...base,
    type: z.literal("contract.signed"),
    data: z.object({
      ...customer,
      contract_id: z.string(),
      signed_at: z.string().datetime({ offset: true }),
      minimum_term_ends_at: z.string().datetime({ offset: true }),
    }),
  }),
]);

export type PortalCallback = z.infer<typeof portalCallbackSchema>;
export type PortalCallbackType = PortalCallback["type"];
