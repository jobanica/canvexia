import { z } from "zod";

/**
 * What the catalogue form is allowed to say.
 *
 * Separate from the server action because a `"use server"` file may only export
 * async functions — so a schema declared there cannot be tested, and two of
 * these fields decide whether a controlled medicine can be sold by a cashier.
 */

/** Trim, and treat an empty box as "not set" rather than as an empty string. */
const Optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .default(null);

/**
 * THE PRICE, which a blank cannot mean.
 *
 * `z.coerce.number()` parses `""` as **0**, and an HTML form submits an empty
 * text box as `""` rather than omitting it — so a plain coercion turns "I left
 * it alone" into "this item is free". Same trap as the VAT rate in
 * settings-input.ts, and the same answer: the refusal lives here, not on a
 * `required` attribute any POST can omit.
 *
 * 0 is still legitimate — a sample, or something given away — so it has to be
 * typed on purpose.
 */
export const Price = z
  .string()
  .trim()
  .min(1, "Enter a price in pesos — 0 if this item is given away.")
  .pipe(z.coerce.number().min(0).max(1_000_000))
  // Pesos in the form, centavos in the column. Rounded rather than truncated:
  // 19.99 in floating point is 1998.9999…, and truncation would price it at
  // ₱19.98 for the rest of its life.
  .transform((pesos) => Math.round(pesos * 100));

/**
 * THE REORDER POINT, which is why the low-stock report has never fired.
 *
 * The column defaults to 0 and nothing could ever set it, so the dashboard's
 * `onHand <= reorderPoint` only triggered at zero — "about to run out" actually
 * meant "already out". A blank here would put it straight back, so the same
 * rule applies: 0 is a real answer and has to be a deliberate one.
 */
export const ReorderPoint = z
  .string()
  .trim()
  .min(1, "Enter a reorder point — the level at which you want warning. 0 turns it off.")
  .pipe(z.coerce.number().int().min(0).max(1_000_000));

/**
 * A checkbox is absent from the form when unticked — it is not "false", it is
 * nothing at all. Coercing the missing value is exactly right here and exactly
 * wrong for the two fields above, which is worth being explicit about: the
 * difference is that a checkbox has no third state and a number does.
 */
const Flag = z
  .union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined(), z.null()])
  .transform((v) => v === "on" || v === "true");

export const ProductInput = z.object({
  name: z.string().trim().min(1, "Give the product a name.").max(200),
  genericName: Optional(200),
  form: Optional(60),
  strength: Optional(60),
  sku: Optional(60),
  barcode: Optional(60),
  unit: z.string().trim().min(1).max(30).default("piece"),
  categoryId: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable()
    .default(null),
  requiresPrescription: Flag,
  reorderPoint: ReorderPoint,
  priceCentavos: Price,
});

export type ProductInputValues = z.infer<typeof ProductInput>;
