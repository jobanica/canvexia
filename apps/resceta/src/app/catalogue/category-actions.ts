"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import {
  createCategory,
  deleteCategory,
  recategorise,
  renameCategory,
} from "@/server/pharmacy/categories";

export type CategoryState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown): CategoryState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "Only an owner or manager can change categories."
        : "Your session has expired. Sign in again.",
  };
}

/** Create or rename, depending on whether an id came with the form. */
export async function saveCategory(
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  let staff;
  try {
    staff = await requireStaff("manageCatalogue");
  } catch (e) {
    return denied(e);
  }

  const name = String(formData.get("name") ?? "");
  const id = String(formData.get("categoryId") ?? "").trim();

  const res = id
    ? await renameCategory({
        pharmacyId: staff.pharmacyId,
        categoryId: id,
        name,
        actorStaffId: staff.staffId,
      })
    : await createCategory({ pharmacyId: staff.pharmacyId, name, actorStaffId: staff.staffId });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/catalogue");
  return { status: "done", message: id ? "Renamed." : `${name.trim()} added.` };
}

export async function removeCategory(
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  let staff;
  try {
    staff = await requireStaff("manageCatalogue");
  } catch (e) {
    return denied(e);
  }

  const id = String(formData.get("categoryId") ?? "").trim();
  if (!id) return { status: "error", message: "No category was selected." };

  const res = await deleteCategory({
    pharmacyId: staff.pharmacyId,
    categoryId: id,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/catalogue");
  return { status: "done", message: "Category removed." };
}

export async function moveCategory(
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  let staff;
  try {
    staff = await requireStaff("manageCatalogue");
  } catch (e) {
    return denied(e);
  }

  const fromId = String(formData.get("fromId") ?? "").trim();
  const toRaw = String(formData.get("toId") ?? "").trim();
  if (!fromId) return { status: "error", message: "No category was selected." };

  const res = await recategorise({
    pharmacyId: staff.pharmacyId,
    fromId,
    // "" means "no category at all", which is a real destination.
    toId: toRaw || null,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/catalogue");
  return { status: "done", message: `${res.moved} products moved.` };
}
