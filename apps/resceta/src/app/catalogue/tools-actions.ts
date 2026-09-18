"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { parseCsv, readImport, type ImportRow } from "@/lib/pharmacy/csv";
import { importCatalogue } from "@/server/pharmacy/catalogue-import";
import { mergeProducts } from "@/server/pharmacy/merge-products";
import { scanReceipt, type ReceiptExtractionValues } from "@/server/pharmacy/receipt-scan";
import { branchContext } from "@/server/pharmacy/branches";

/**
 * The three bulk tools on the catalogue.
 *
 * ALL THREE ARE `manageCatalogue`, and merging deserves a word: it moves years
 * of sale lines onto a different product. It is the most destructive thing on
 * this screen, and it is gated with the same key as editing a price because the
 * people who hold it — owner and manager — are exactly who should do it.
 *
 * The parsing lives in `lib/pharmacy/csv.ts` and the merge rule in
 * `lib/pharmacy/duplicates.ts`, where both can be tested: a `"use server"`
 * module may only export async functions.
 */

export type ToolState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown): ToolState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "Only an owner or manager can do that."
        : "Your session has expired. Sign in again.",
  };
}

export async function importProducts(_prev: ToolState, formData: FormData): Promise<ToolState> {
  let staff;
  try {
    staff = await requireStaff("manageCatalogue");
  } catch (e) {
    return denied(e);
  }

  // The rows were parsed and REVIEWED in the browser, but they are re-parsed
  // here from the raw text: what the server imports has to be what the server
  // read, not a JSON blob the page could have rewritten.
  const text = String(formData.get("csv") ?? "");
  if (!text.trim()) return { status: "error", message: "No file was chosen." };

  const parsed = readImport(parseCsv(text));
  if (parsed.error) return { status: "error", message: parsed.error };

  const branch = await branchContext(staff.pharmacyId);
  const res = await importCatalogue({
    pharmacyId: staff.pharmacyId,
    branchId: branch.writeBranchId,
    rows: parsed.rows as ImportRow[],
    updateExisting: formData.get("updateExisting") !== null,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  const o = res.outcome;
  revalidatePath("/catalogue");
  revalidatePath("/");
  revalidatePath("/alerts");

  const bits = [`${o.created} added`, `${o.updated} updated`];
  if (o.batches > 0) bits.push(`${o.units} units in ${o.batches} batches`);
  if (o.skipped > 0) bits.push(`${o.skipped} skipped`);
  if (o.failures.length > 0) {
    bits.push(
      `${o.failures.length} failed (line ${o.failures.map((f) => f.line).slice(0, 5).join(", ")})`,
    );
  }
  return { status: "done", message: `${bits.join(" · ")}.` };
}

export async function mergeDuplicates(_prev: ToolState, formData: FormData): Promise<ToolState> {
  let staff;
  try {
    staff = await requireStaff("manageCatalogue");
  } catch (e) {
    return denied(e);
  }

  const keepId = String(formData.get("keepId") ?? "").trim();
  const mergeIds = formData.getAll("mergeId").map(String).filter(Boolean);
  if (!keepId) return { status: "error", message: "Pick which product to keep." };

  const res = await mergeProducts({
    pharmacyId: staff.pharmacyId,
    keepId,
    mergeIds,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  const o = res.outcome;
  revalidatePath("/catalogue");
  revalidatePath("/");
  revalidatePath("/alerts");
  return {
    status: "done",
    message: `Merged ${o.mergedProducts} into ${o.keptName} — ${o.movedUnits} units in ${o.movedBatches} batches and ${o.movedSaleLines} sale lines moved across.`,
  };
}

export type ScanState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; data: ReceiptExtractionValues };

/**
 * Read a delivery receipt from a photo.
 *
 * WRITES NOTHING. It returns a draft for a human to check against the paper and
 * hand to the receiving screen, which does the writing with its own validation.
 * `manageStock` rather than `manageCatalogue`: the person holding the delivery
 * receipt is the pharmacist who took the boxes in.
 */
export async function scanDeliveryReceipt(
  _prev: ScanState,
  formData: FormData,
): Promise<ScanState> {
  try {
    await requireStaff("manageStock");
  } catch (e) {
    const d = denied(e);
    return { status: "error", message: d.status === "error" ? d.message : "Not allowed." };
  }

  const dataUrl = String(formData.get("image") ?? "");
  if (!dataUrl) return { status: "error", message: "Take or choose a photo first." };

  const res = await scanReceipt(dataUrl);
  if (!res.ok) return { status: "error", message: res.error };
  return { status: "done", data: res.data };
}
