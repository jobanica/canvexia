import { bluetoothHelp, isUserCancel } from "@/lib/printing/bluetooth-help";

/**
 * What to tell the cashier when a document didn't print.
 *
 * Every browser-side print used to be wrapped in an empty catch marked
 * "non-blocking". The intent was right — a printer must never stop an order
 * being taken — but the result was that a shop set to print kitchen tickets
 * pressed Send to kitchen, nothing came out, and nothing on screen said so.
 * From the counter that is indistinguishable from the feature not existing.
 *
 * Non-blocking should mean "doesn't stop the order", not "doesn't tell anyone".
 *
 * Pure, so the wording can be tested without a printer.
 */

const DOC_LABEL: Record<string, string> = {
  kitchen: "kitchen ticket",
  receipt: "receipt",
  bill: "bill",
};

/**
 * Returns the message, or null when there is nothing worth saying.
 *
 * Null for a cancelled device chooser: they pressed Cancel a second ago and
 * telling them they cancelled is noise.
 */
export function printFailureMessage(
  doc: "bill" | "receipt" | "kitchen",
  error: unknown,
  userAgent = "",
): string | null {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (isUserCancel(raw)) return null;

  const what = DOC_LABEL[doc] ?? "ticket";
  const help = bluetoothHelp(raw, userAgent).message;
  return `Couldn't print the ${what}. ${help}`;
}
