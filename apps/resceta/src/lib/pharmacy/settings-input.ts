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

/**
 * A whole non-negative number from a text box, with a default when it is blank.
 *
 * Unlike the VAT rate, a blank here is not a dangerous answer — a loyalty rate
 * nobody typed is zero, which is "off", which is the safe state. So this
 * defaults rather than refusing.
 */
const Count = (max: number, fallback = 0) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? fallback : Number(v)))
    .pipe(z.coerce.number().int().min(0).max(max));

/**
 * A checkbox, and the problem with them.
 *
 * An unticked checkbox is ABSENT from the FormData — indistinguishable from a
 * form that never had that section in it. Read naively, "not sent" and "the
 * user turned it off" look identical, so a partial save would quietly switch
 * the storefront off.
 *
 * The fix is a hidden companion field the section always carries. Its presence
 * means "this section was on screen, so the checkbox's absence is a decision";
 * its absence means "leave whatever is stored alone", and the field comes back
 * `undefined` and is dropped before the write.
 */
const Flag = (present: unknown) =>
  z
    .any()
    .transform((v) =>
      present ? v !== null && v !== undefined && v !== "" && v !== "off" : undefined,
    );

export const SettingsInput = z.object({
  displayName: Optional(120),
  address: Optional(300),
  phone: Optional(40),
  email: Optional(200),
  tin: Optional(40),
  fdaLtoNumber: Optional(60),
  prcLicenseNo: Optional(60),
  vatRatePct: VatRate,

  // EVERYTHING BELOW IS OPTIONAL, so a caller that does not send a section
  // does not blank it. `updatePharmacySettings` drops undefined before writing.

  // 58 or 80 are the two thermal roll widths; anything else is a typo, and a
  // receipt laid out for the wrong width wraps every line.
  receiptPaperMm: z
    .string()
    .trim()
    .transform((v) => (v === "80" ? 80 : 58))
    .pipe(z.coerce.number())
    .optional(),
  receiptHeader: Optional(400).optional(),
  receiptFooter: Optional(400).optional(),
  birPermitNo: Optional(60).optional(),
  posSerialNo: Optional(60).optional(),

  // Loyalty. Both zero means off, which is the default and stays the default:
  // a programme nobody configured must not quietly accrue a liability.
  loyaltyPointsPerPeso: Count(100).optional(),
  loyaltyCentavosPerPoint: Count(10000).optional(),

  storefrontBlurb: Optional(600).optional(),
});

export type SettingsInputValues = z.infer<typeof SettingsInput>;

/**
 * The two checkboxes, parsed against the marker that says their section was on
 * screen. Separate from the object above because their meaning depends on a
 * field that is not one of them.
 */
export function parseStorefrontFlags(input: {
  sectionPresent: unknown;
  storefrontOn: unknown;
  storefrontAcceptsDelivery: unknown;
}): { storefrontOn?: boolean; storefrontAcceptsDelivery?: boolean } {
  const present = Flag(true).parse(input.sectionPresent);
  if (!present) return {};
  return {
    storefrontOn: Flag(true).parse(input.storefrontOn) as boolean,
    storefrontAcceptsDelivery: Flag(true).parse(input.storefrontAcceptsDelivery) as boolean,
  };
}
