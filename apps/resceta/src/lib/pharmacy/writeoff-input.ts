import { z } from "zod";

/**
 * Taking stock off the shelf for a reason that is not a sale.
 *
 * FIVE REASONS AND "OTHER", and the distinctions are not cosmetic. A pharmacy
 * is asked at year end for the value of expired stock, is asked by the FDA
 * about recalls, and needs its donations separable for the books. A single
 * "adjustment" with a free-text note answers none of those without somebody
 * reading every row.
 */
export const WRITEOFF_REASONS = [
  "expired",
  "damaged",
  "donated",
  "lost",
  "recalled",
  "other",
] as const;
export type WriteoffReason = (typeof WRITEOFF_REASONS)[number];

export const REASON_LABEL: Record<WriteoffReason, string> = {
  expired: "Expired",
  damaged: "Damaged",
  donated: "Donated or given away",
  lost: "Lost or unaccounted for",
  recalled: "Recalled",
  other: "Other",
};

export const WriteoffInput = z
  .object({
    batchId: z.string().uuid("Pick the batch this is coming out of."),
    quantity: z.coerce
      .number({ message: "Enter a quantity." })
      .int("Quantities come in whole units.")
      .positive("Enter how many units are coming off the shelf."),
    reason: z.enum(WRITEOFF_REASONS),
    recipient: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    notes: z
      .string()
      .trim()
      .max(1000)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
  })
  .refine((v) => v.reason !== "donated" || !!v.recipient, {
    // A donation with no recipient is indistinguishable from stock that walked
    // — which is precisely what the word "donated" would then be hiding.
    message: "Say who received the donation.",
    path: ["recipient"],
  });

export type WriteoffInputValues = z.infer<typeof WriteoffInput>;

/**
 * Which stock-movement type a write-off records as.
 *
 * The movement enum predates this screen and has one dedicated value,
 * `expiry_writeoff`; everything else is an `adjustment`. Mapping here rather
 * than adding enum values keeps the ledger readable by code that already
 * exists — and the write-off row carries the real reason either way, which is
 * the one somebody reports from.
 */
export function movementTypeFor(reason: WriteoffReason): "expiry_writeoff" | "adjustment" {
  return reason === "expired" ? "expiry_writeoff" : "adjustment";
}
