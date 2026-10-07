import { z } from "zod";

/**
 * The event contract between a product and the agent portal.
 *
 * One file, imported by both sides: the connection kit builds events with
 * these types and the portal validates them with these schemas. A field
 * renamed on one side and not the other is then a type error rather than a
 * customer whose payment silently never arrives.
 *
 * Field names are snake_case because they are a wire format, read by products
 * that may not be written in TypeScript at all.
 *
 * Money is integer centavos. Months are "YYYY-MM".
 */

const externalCustomerId = z.string().trim().min(1).max(200);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

export const customerSignedUpData = z.object({
  external_customer_id: externalCustomerId,
  business_name: z.string().trim().min(1).max(200),
  owner_name: z.string().trim().min(1).max(200),
  owner_phone: z.string().trim().min(1).max(40),
  /** What the customer typed or the ?ref= cookie carried. Unvalidated. */
  agent_code: z.string().trim().max(40).nullish(),
  plan: z.string().trim().max(80).nullish(),
});

export const paymentSubmittedData = z
  .object({
    external_customer_id: externalCustomerId,
    type: z.enum(["activation", "monthly"]),
    months_covered: z.number().int().min(1).max(24),
    /** First month paid for. Required for monthly, ignored for activation. */
    billing_month_start: month.nullish(),
    amount: z.number().int().positive(),
    bank_reference: z.string().trim().min(3).max(100),
    /** Path returned by the portal's receipt upload. */
    receipt_path: z.string().trim().max(500).nullish(),
  })
  .superRefine((d, ctx) => {
    if (d.type === "monthly" && !d.billing_month_start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billing_month_start"],
        message: "required for a monthly payment",
      });
    }
    if (d.type === "activation" && d.months_covered !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["months_covered"],
        message: "an activation payment covers exactly one activation",
      });
    }
  });

export const customerCancelledData = z.object({
  external_customer_id: externalCustomerId,
  reason: z.string().trim().max(500).nullish(),
});

export const customerReactivatedData = z.object({
  external_customer_id: externalCustomerId,
});

const envelope = <T extends string, D extends z.ZodTypeAny>(type: T, data: D) =>
  z.object({
    /** Product-generated, globally unique. The portal is idempotent on it. */
    event_id: z.string().trim().min(8).max(200),
    type: z.literal(type),
    occurred_at: z.string().datetime({ offset: true }),
    data,
  });

export const productEventSchema = z.discriminatedUnion("type", [
  envelope("customer.signed_up", customerSignedUpData),
  envelope("payment.submitted", paymentSubmittedData),
  envelope("customer.cancelled", customerCancelledData),
  envelope("customer.reactivated", customerReactivatedData),
]);

export type ProductEvent = z.infer<typeof productEventSchema>;
export type ProductEventType = ProductEvent["type"];
export const PRODUCT_EVENT_TYPES = [
  "customer.signed_up",
  "payment.submitted",
  "customer.cancelled",
  "customer.reactivated",
] as const satisfies readonly ProductEventType[];

/** GET /api/v1/codes/{code} */
export interface CodeLookupResponse {
  code: string;
  /** A code that belongs to an agent, whatever their status. */
  valid: boolean;
  /** The agent is active, so a signup with this code attaches to them. */
  active: boolean;
  /** Only when active. Shown as "Referred by {agent_name}". */
  agent_name: string | null;
}

/** GET /api/v1/customers/{external_customer_id} */
export interface CustomerTermsResponse {
  external_customer_id: string;
  /** False if the portal has not processed this customer's signup yet. */
  known: boolean;
  status: "lead" | "active" | "churned" | null;
  paid_months: number;
  /** From the commission rule the customer signed up under. Null if none. */
  activation_fee: number | null;
  monthly_fee: number | null;
  activation_confirmed: boolean;
  contract_signed: boolean;
}

/** POST /api/v1/events */
export interface EventResponse {
  event_id: string;
  /**
   * processed — done.
   * pending   — accepted, waiting for something (a payment for a customer whose
   *             signup has not arrived yet). The portal retries it itself.
   * duplicate — already received. Not an error: stop sending it.
   * refused   — accepted and recorded, but will not be acted on (see `error`).
   */
  status: "processed" | "pending" | "duplicate" | "refused";
  error?: string;
}
