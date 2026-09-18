"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { z } from "zod";
import { ProductInput } from "@/lib/pharmacy/product-input";
import { branchContext } from "@/server/pharmacy/branches";
import type { OpeningStock } from "@/server/pharmacy/catalogue";
import { createProduct, setProductActive, updateProduct } from "@/server/pharmacy/catalogue";

/**
 * Catalogue writes.
 *
 * The pharmacy is not in the form — it comes from the session, same as every
 * other write in this app. `manageCatalogue` is the gate, and it was another
 * permission with no screen: owner and manager have held it since the role
 * table was written, and there was nothing anywhere for them to manage.
 *
 * The shape is in `lib/pharmacy/product-input.ts`, where it can be tested — a
 * `"use server"` file may only export async functions, and two of those fields
 * decide whether a cashier can sell an antibiotic.
 */

export type CatalogueState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown): CatalogueState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "This account cannot change the catalogue."
        : "Your session has expired. Sign in again.",
  };
}

function read(formData: FormData) {
  return ProductInput.safeParse({
    name: formData.get("name") ?? "",
    genericName: formData.get("genericName") ?? "",
    form: formData.get("form") ?? "",
    strength: formData.get("strength") ?? "",
    sku: formData.get("sku") ?? "",
    barcode: formData.get("barcode") ?? "",
    unit: formData.get("unit") || "piece",
    categoryId: formData.get("categoryId") ?? "",
    // Absent from the FormData entirely when unticked — see the note on `Flag`.
    requiresPrescription: formData.get("requiresPrescription"),
    reorderPoint: formData.get("reorderPoint") ?? "",
    priceCentavos: formData.get("price") ?? "",
  });
}

/**
 * OPENING STOCK, read off the same form that created the product.
 *
 * ALL OR NOTHING ON THE QUANTITY: no quantity means no batch, and the rest of
 * the section is ignored rather than creating an empty batch with a date on it.
 *
 * A QUANTITY WITH NO COST IS REFUSED, not accepted as free. A batch at zero
 * cost shows a 100% margin on every report it ever touches, and the person
 * typing an opening quantity is holding the delivery note that has the cost on
 * it.
 */
const Opening = z.object({
  quantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
  unitCost: z.string().trim().max(20).default(""),
  lotNumber: z.string().trim().max(60).default(""),
  expiryDate: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use the date picker for the expiry.")
    .default(""),
  supplierId: z.string().uuid().or(z.literal("")).default(""),
});

function pesosToCentavos(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function readOpening(
  formData: FormData,
): { ok: true; opening: OpeningStock | null } | { ok: false; error: string } {
  const parsed = Opening.safeParse({
    quantity: formData.get("openingQuantity") || 0,
    unitCost: formData.get("openingCost") ?? "",
    lotNumber: formData.get("openingLot") ?? "",
    expiryDate: formData.get("openingExpiry") ?? "",
    supplierId: formData.get("openingSupplier") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the opening stock." };
  }

  const v = parsed.data;
  if (v.quantity <= 0) return { ok: true, opening: null };

  const costCentavos = pesosToCentavos(v.unitCost);
  if (costCentavos <= 0) {
    return {
      ok: false,
      error: "Opening stock needs a unit cost — otherwise it shows a 100% margin on every report.",
    };
  }

  return {
    ok: true,
    opening: {
      quantity: v.quantity,
      costCentavos,
      lotNumber: v.lotNumber || null,
      expiry: v.expiryDate || null,
      supplierId: v.supplierId || null,
      branchId: null,
    },
  };
}

export async function saveProduct(
  _prev: CatalogueState,
  formData: FormData,
): Promise<CatalogueState> {
  let staff;
  try {
    staff = await requireStaff("manageCatalogue");
  } catch (e) {
    return denied(e);
  }

  const parsed = read(formData);
  if (!parsed.success) {
    // The schema's own message where it has one — "Enter a reorder point" is
    // actionable; "something didn't look right" is not.
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the fields." };
  }

  const ctx = { pharmacyId: staff.pharmacyId, actorStaffId: staff.staffId };
  const id = String(formData.get("id") ?? "").trim();

  let result;
  let opened = 0;
  if (id) {
    // Editing never touches stock. Changing a price must not be able to
    // conjure a batch, and the batch panel on the row is where stock is
    // corrected.
    result = await updateProduct(ctx, id, parsed.data);
  } else {
    const opening = readOpening(formData);
    if (!opening.ok) return { status: "error", message: opening.error };
    if (opening.opening) {
      // The branch comes from the session's own context, never the form: a
      // branch id in a request body is one somebody can change, and stock
      // filed at the wrong branch takes its movement with it.
      const branch = await branchContext(staff.pharmacyId);
      opening.opening.branchId = branch.writeBranchId;
      opened = opening.opening.quantity;
    }
    result = await createProduct(ctx, parsed.data, opening.opening);
  }

  if (!result.ok) return { status: "error", message: result.error };

  revalidatePath("/catalogue");
  // The dashboard's low-stock list and the counter both read these fields.
  revalidatePath("/");
  revalidatePath("/pos");
  revalidatePath("/alerts");
  return {
    status: "done",
    message: id
      ? "Saved."
      : opened > 0
        ? `${parsed.data.name} added, with ${opened} in opening stock.`
        : `${parsed.data.name} added.`,
  };
}

export async function toggleProduct(
  _prev: CatalogueState,
  formData: FormData,
): Promise<CatalogueState> {
  let staff;
  try {
    staff = await requireStaff("manageCatalogue");
  } catch (e) {
    return denied(e);
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { status: "error", message: "No product selected." };
  const active = formData.get("active") === "true";

  const result = await setProductActive(
    { pharmacyId: staff.pharmacyId, actorStaffId: staff.staffId },
    id,
    active,
  );
  if (!result.ok) return { status: "error", message: result.error };

  revalidatePath("/catalogue");
  revalidatePath("/");
  revalidatePath("/pos");
  return { status: "done", message: active ? "Back on the counter." : "Archived." };
}
