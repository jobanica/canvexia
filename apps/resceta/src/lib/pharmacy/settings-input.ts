import { z } from "zod";

/**
 * What the settings form is allowed to say.
 *
 * Separate from the server action because a `"use server"` file may only export
 * async functions — so a schema declared there cannot be tested, and this one
 * carries a statutory decision that should not be taken on trust.
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
 * The VAT rate, which is the one field a blank cannot mean.
 *
 * `z.coerce.number()` parses `""` as **0**, and an HTML form submits an empty
 * text box as `""` rather than omitting it — so a plain coercion turns "I left
 * it alone" into "this pharmacy is not VAT-registered", which drops the VAT box
 * off every future receipt and changes the SC/PWD arithmetic (the 20% is taken
 * on the VAT-exclusive price, D33).
 *
 * `required` on the input is not that guarantee: it is a browser convenience
 * and any POST can omit it. The refusal has to live here.
 *
 * 0 is still a legitimate value — it is how a non-VAT-registered pharmacy is
 * recorded. It just has to be typed on purpose.
 */
export const VatRate = z
  .string()
  .trim()
  .min(1, "Enter the VAT rate — 12, or 0 if this pharmacy is not VAT-registered.")
  .pipe(z.coerce.number().int().min(0).max(25));

export const SettingsInput = z.object({
  displayName: Optional(120),
  address: Optional(300),
  phone: Optional(40),
  email: Optional(200),
  tin: Optional(40),
  fdaLtoNumber: Optional(60),
  prcLicenseNo: Optional(60),
  vatRatePct: VatRate,
});

export type SettingsInputValues = z.infer<typeof SettingsInput>;
