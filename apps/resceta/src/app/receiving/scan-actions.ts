"use server";

import { requireStaff } from "@/server/tenancy/current-user";
import { scanReceipt } from "@/server/pharmacy/receipt-scan";
import { matchAll, type MatchedLine } from "@/lib/pharmacy/receipt-match";
import { receivingOptions } from "@/server/pharmacy/receiving";

/**
 * Scanning a delivery receipt into the receiving form.
 *
 * STILL WRITES NOTHING. It reads the photo, matches each line against this
 * pharmacy's catalogue, and hands the result to the form the person was already
 * going to fill in. Pressing Receive on that form runs the SAME
 * `receiveDelivery` path as a hand-typed delivery — one stock path, one set of
 * rules, one place that allocates batches and writes the ledger.
 *
 * That is what "auto-add once verified" means here: the scan does the typing,
 * the person does the verifying, and the existing receiving code does the
 * writing. A scan that booked stock on its own would be a machine that can
 * invent an expiry date and have nobody notice.
 */

export type ScanIntoState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "done";
      supplierName: string | null;
      lines: MatchedLine[];
      /** How many are ready to receive without anybody touching them. */
      ready: number;
    };

export async function scanIntoDelivery(
  _prev: ScanIntoState,
  formData: FormData,
): Promise<ScanIntoState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account cannot receive stock."
          : "Your session has expired. Sign in again.",
    };
  }

  const dataUrl = String(formData.get("image") ?? "");
  if (!dataUrl) return { status: "error", message: "Take or choose a photo first." };

  const scan = await scanReceipt(dataUrl);
  if (!scan.ok) return { status: "error", message: scan.error };

  // Matched against the catalogue HERE, on the server, from the session's own
  // pharmacy — never against a product list the page sent up.
  const { products } = await receivingOptions(staff.pharmacyId);
  const lines = matchAll(scan.data.lines, products);

  return {
    status: "done",
    supplierName: scan.data.supplierName,
    lines,
    ready: lines.filter((l) => l.blockers.length === 0 && l.match.confidence === "exact").length,
  };
}
