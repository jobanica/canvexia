"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type FormState = { ok?: boolean; error?: string } | null;

const createSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["kitchen", "cashier", "merchant", "manager", "admin"]),
  displayName: z.string().trim().max(80).optional().or(z.literal("")),
});

/**
 * Creates a staff login: a Supabase Auth user (email pre-confirmed so they can
 * sign in immediately) + the linked staff_users row that defines their role.
 * Role drives access: kitchen→/kitchen, cashier→/cashier, manager→HR,
 * admin→full dashboard.
 */
export async function createStaff(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    displayName: formData.get("displayName") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { error: error?.message ?? "Couldn't create the login." };
  }
  const authUserId = data.user.id;

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.staffUser.create({
        data: {
          restaurantId,
          authUserId,
          role: parsed.data.role,
          email: parsed.data.email,
          displayName: parsed.data.displayName || null,
        },
      }),
    );
  } catch (e) {
    // Roll back the auth user so the email can be reused.
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "Couldn't add staff";
    return { error: /unique/i.test(msg) ? "That email already has a login here." : msg };
  }

  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function updateStaffRole(formData: FormData): Promise<void> {
  const me = await requireAdminAction();
  const id = String(formData.get("id"));
  const role = formData.get("role") as "kitchen" | "cashier" | "merchant" | "manager" | "admin";
  if (id === me.staffUserId) return; // can't change your own role (lockout guard)
  await tenantDb(me.restaurantId, (tx) =>
    tx.staffUser.update({ where: { id }, data: { role }, select: { id: true } }),
  );
  revalidatePath("/admin/staff");
}

export type StaffCredState = { ok?: boolean; message?: string; error?: string } | null;

/** Admin sets a new password for one of their staff. Tenant-scoped. */
export async function resetStaffPassword(_prev: StaffCredState, formData: FormData): Promise<StaffCredState> {
  const me = await requireAdminAction();
  const id = String(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  const staff = await tenantDb(me.restaurantId, (tx) =>
    tx.staffUser.findFirst({ where: { id }, select: { authUserId: true } }),
  );
  if (!staff) return { error: "Staff member not found." };
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(staff.authUserId, { password });
  if (error) return { error: error.message };
  return { ok: true, message: "Password updated." };
}

/** Admin changes a staff member's login email. Tenant-scoped. */
export async function updateStaffEmail(_prev: StaffCredState, formData: FormData): Promise<StaffCredState> {
  const me = await requireAdminAction();
  const id = String(formData.get("id"));
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter an email." };
  const staff = await tenantDb(me.restaurantId, (tx) =>
    tx.staffUser.findFirst({ where: { id }, select: { authUserId: true } }),
  );
  if (!staff) return { error: "Staff member not found." };
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(staff.authUserId, {
    email,
    email_confirm: true,
  });
  if (error) return { error: error.message };
  await tenantDb(me.restaurantId, (tx) =>
    tx.staffUser.update({ where: { id }, data: { email }, select: { id: true } }),
  );
  revalidatePath("/admin/staff");
  return { ok: true, message: "Email updated." };
}

export async function deleteStaff(formData: FormData): Promise<void> {
  const me = await requireAdminAction();
  const id = String(formData.get("id"));
  if (id === me.staffUserId) return; // can't delete yourself

  const staff = await tenantDb(me.restaurantId, async (tx) => {
    const row = await tx.staffUser.findFirst({
      where: { id },
      select: { id: true, authUserId: true },
    });
    if (row) await tx.staffUser.delete({ where: { id } });
    return row;
  });
  if (staff) {
    try {
      await createSupabaseAdminClient().auth.admin.deleteUser(staff.authUserId);
    } catch {
      /* ignore */
    }
  }
  revalidatePath("/admin/staff");
}
