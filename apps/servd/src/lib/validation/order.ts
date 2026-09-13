import { z } from "zod";

/**
 * The diner client sends only IDENTIFIERS and quantities — never prices. The
 * server looks up the real items/modifiers, re-validates the selection rules,
 * and recomputes the total. This schema just shapes/limits the untrusted input.
 */
export const placeOrderSchema = z.object({
  slug: z.string().min(1),
  tableToken: z.string().min(1),
  loyaltyPhone: z.string().trim().max(30).optional(),
  couponCode: z.string().trim().max(24).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(99),
        note: z.string().trim().max(200).optional(),
        // Flat list of chosen modifier ids; server maps them back to groups.
        modifierIds: z.array(z.string().uuid()).max(50).default([]),
        // Chosen size/variant id (server re-resolves its price).
        variantId: z.string().uuid().optional(),
      }),
    )
    .min(1, "Your cart is empty")
    .max(100),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber?: number | null }
  | { ok: false; error: string };
