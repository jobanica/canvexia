"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { ProductInput } from "@/lib/pharmacy/product-input";
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

  const result = id
    ? await updateProduct(ctx, id, parsed.data)
    : await createProduct(ctx, parsed.data);

  if (!result.ok) return { status: "error", message: result.error };

  revalidatePath("/catalogue");
  // The dashboard's low-stock list and the counter both read these fields.
  revalidatePath("/");
  revalidatePath("/pos");
  return { status: "done", message: id ? "Saved." : `${parsed.data.name} added.` };
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
