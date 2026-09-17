import { z } from "zod";

/**
 * A prescription, as a record.
 *
 * `PharmacySale.prescriptionRef` is a string somebody types at the counter.
 * That is enough to print on a receipt and not enough to answer "show me every
 * dispensing against this PRC number", which is what an inspection asks. The
 * paper Rx remains the legal document; this is the index into it.
 *
 * THE DOCTOR IS REQUIRED AND THE PRC NUMBER IS NOT. A pharmacist holding a
 * paper Rx always has the prescriber's name; the PRC number is often not
 * legible on it, and refusing to record the prescription because of that means
 * no record at all — which is strictly worse than an incomplete one.
 */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const dateField = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => ISO_DATE.test(v), message)
    .transform((v) => new Date(`${v}T00:00:00+08:00`));

export const PrescriptionInput = z.object({
  customerId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  rxNumber: optional(100),
  patientName: z.string().trim().min(1, "Whose prescription is it?").max(200),
  patientDob: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null)
    .transform((v) => (v && ISO_DATE.test(v) ? new Date(`${v}T00:00:00+08:00`) : null)),
  doctorName: z.string().trim().min(1, "Who prescribed it?").max(200),
  doctorPrcNo: optional(50),
  // Manila midnight, not UTC: a prescription written on the 3rd must not be
  // filed under the 2nd because the server is in another hemisphere.
  dateIssued: dateField("Enter the date on the prescription."),
  notes: optional(2000),
});

export type PrescriptionInputValues = z.infer<typeof PrescriptionInput>;

/**
 * How long a prescription is good for.
 *
 * Under PH practice an ordinary prescription is dispensed within a reasonable
 * period and a dangerous-drug prescription is tightly time-bound. This app does
 * not decide the law — it shows the age of the Rx so the pharmacist can, which
 * is the difference between a tool and a liability.
 */
export function ageInDays(dateIssued: Date, asOf: Date = new Date()): number {
  return Math.floor((asOf.getTime() - dateIssued.getTime()) / 86_400_000);
}
