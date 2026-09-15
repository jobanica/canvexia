"use server";

import { revalidatePath } from "next/cache";
import { canManageSeatRole, isPartnerUserRole } from "@servd/core";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type StaffState = { ok?: boolean; error?: string } | null;

/** The seat being acted on, confirmed to belong to this partner. */
async function targetSeat(partnerId: string, staffId: string) {
  return systemDb((tx) =>
    tx.partnerUser.findFirst({
      where: { id: staffId, partnerId },
      select: { id: true, email: true, name: true, role: true, status: true, authUserId: true },
    }),
  );
}

/**
 * Edit a staff member's record.
 *
 * `hr.view_all` is the read; editing needs `team.manage`, and an ops_manager
 * may not edit an admin's record — `canManageSeatRole` is the brief's
 * "✓ (not admins)", which is a constraint on the object of the action and
 * cannot be expressed as a permission key.
 */
export async function updateStaffProfileAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner("team.manage");
  if (!who) return;

  const staffId = String(formData.get("staffId") ?? "");
  const target = await targetSeat(who.partnerId, staffId);
  if (!target) return;
  if (!isPartnerUserRole(target.role)) return;
  if (!canManageSeatRole(who.partner.user.role, target.role)) return;

  const trim = (k: string, max: number) =>
    String(formData.get(k) ?? "").trim().slice(0, max) || null;

  const startRaw = String(formData.get("startDate") ?? "").trim();
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? new Date(`${startRaw}T00:00:00Z`) : null;

  const data = {
    name: trim("name", 120),
    mobile: trim("mobile", 40),
    zone: trim("zone", 120),
    startDate,
    emergencyName: trim("emergencyName", 120),
    emergencyMobile: trim("emergencyMobile", 40),
  };

  await systemDb(async (tx) => {
    await tx.partnerUser.update({ where: { id: staffId }, data, select: { id: true } });
    await writeSeatAudit(tx, who, {
      action: "partner.staff_updated",
      entityType: "partner_user",
      entityId: staffId,
      // The emergency contact is NOT written into the audit row. The log is
      // read by more people than the record is, and a value copied into it has
      // escaped the permission that was guarding it.
      after: { name: data.name, mobile: data.mobile, zone: data.zone, startDate: startRaw },
    });
  });

  revalidatePath(`/partner/team/staff/${staffId}`);
  revalidatePath("/partner/team");
}

/**
 * Move one merchant or prospect to a different seat.
 *
 * `pipeline.assign` for prospects, `team.manage` for merchants: assigning a
 * merchant is a change to who is responsible for a paying account, and
 * assigning a prospect is day-to-day pipeline work. They are different acts.
 */
export async function assignSubjectAction(formData: FormData): Promise<void> {
  const kind = String(formData.get("kind") ?? "");
  const who = await requireWritablePartner(
    kind === "prospect" ? "pipeline.assign" : "team.manage",
  );
  if (!who) return;

  const subjectId = String(formData.get("subjectId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const as = String(formData.get("as") ?? "sales");
  const toRaw = String(formData.get("toUserId") ?? "");
  // The empty string means "unassign", which is a real answer: a merchant
  // nobody owns is better recorded than one recorded against somebody who left.
  const toUserId = toRaw || null;

  if (toUserId) {
    const target = await targetSeat(who.partnerId, toUserId);
    if (!target || target.status !== "active") return;
  }

  await systemDb(async (tx) => {
    if (kind === "prospect") {
      const n = await tx.prospect.updateMany({
        where: { id: subjectId, partnerId: who.partnerId },
        data: { assignedToId: toUserId },
      });
      if (n.count === 0) return;
    } else {
      const column = as === "support" ? "assignedSupportUserId" : "assignedSalesUserId";
      // Two merchant tables (D29), so the product decides which one.
      const model = productId === "pharmacy" ? tx.pharmacy : tx.restaurant;
      const n = await (model as { updateMany: Function }).updateMany({
        where: { id: subjectId, partnerId: who.partnerId },
        data: { [column]: toUserId },
      });
      if (n.count === 0) return;
    }
    await writeSeatAudit(tx, who, {
      action: kind === "prospect" ? "partner.prospect_assigned" : "partner.merchant_assigned",
      entityType: kind === "prospect" ? "prospect" : "merchant",
      entityId: subjectId,
      after: { productId, as, toUserId },
    });
  });

  revalidatePath("/partner/team");
  revalidatePath("/partner/pipeline");
  revalidatePath("/partner/merchants");
}

/**
 * Offboard a staff member: deactivate, hand over everything, revoke the session.
 *
 * ONE TRANSACTION for the database half, because a half-offboarded seat is the
 * worst of the three outcomes: deactivated but still holding a book means the
 * merchants have nobody, and reassigned but still active means somebody who
 * left can still sign in.
 *
 * SESSION REVOCATION IS DELIBERATE AND IS NOT ACCOUNT CREATION. This codebase
 * refuses to mint passwords with the service-role key — /hq/team and the
 * bootstrap SQL both say so — and that rule stands. Signing somebody out is the
 * opposite act: it takes access away. Without it a dismissed salesperson keeps
 * a valid session until their token lapses, which is the window that matters.
 *
 * It runs AFTER the transaction commits, and its failure is recorded rather
 * than raised: the handover is the part that must not be half-done, and an
 * offboarding that rolled back because Supabase was briefly unreachable would
 * leave the person fully active.
 */
export async function offboardStaffAction(
  _prev: StaffState,
  formData: FormData,
): Promise<StaffState> {
  const who = await requireWritablePartner("team.manage");
  if (!who) return { error: "You can't manage the team from this account." };

  const staffId = String(formData.get("staffId") ?? "");
  const toRaw = String(formData.get("reassignTo") ?? "");
  const reassignTo = toRaw || null;

  if (staffId === who.userId) {
    return { error: "You can't offboard yourself. Ask another admin." };
  }

  const target = await targetSeat(who.partnerId, staffId);
  if (!target) return { error: "That person isn't on your team." };
  if (!isPartnerUserRole(target.role)) return { error: "That seat has an unreadable role." };
  if (!canManageSeatRole(who.partner.user.role, target.role)) {
    return { error: "Only an admin can offboard an admin." };
  }

  if (reassignTo) {
    const dest = await targetSeat(who.partnerId, reassignTo);
    if (!dest || dest.status !== "active") {
      return { error: "Pick someone active to hand the work to." };
    }
    if (dest.id === staffId) return { error: "Pick somebody else to hand the work to." };
  }

  // The last active admin cannot be offboarded. Same refusal /hq/team makes
  // about the last super admin: it would leave the screen that grants access
  // unreachable from inside it, and the only way back is hand-run SQL.
  if (target.role === "admin") {
    const admins = await systemDb((tx) =>
      tx.partnerUser.count({
        where: { partnerId: who.partnerId, role: "admin", status: "active" },
      }),
    );
    if (admins <= 1) {
      return { error: "This is your last admin. Make somebody else an admin first." };
    }
  }

  let moved = { restaurants: 0, pharmacies: 0, prospects: 0 };
  await systemDb(async (tx) => {
    const r1 = await tx.restaurant.updateMany({
      where: { partnerId: who.partnerId, assignedSalesUserId: staffId },
      data: { assignedSalesUserId: reassignTo },
    });
    const r2 = await tx.restaurant.updateMany({
      where: { partnerId: who.partnerId, assignedSupportUserId: staffId },
      data: { assignedSupportUserId: reassignTo },
    });
    const p1 = await tx.pharmacy.updateMany({
      where: { partnerId: who.partnerId, assignedSalesUserId: staffId },
      data: { assignedSalesUserId: reassignTo },
    });
    const p2 = await tx.pharmacy.updateMany({
      where: { partnerId: who.partnerId, assignedSupportUserId: staffId },
      data: { assignedSupportUserId: reassignTo },
    });
    const pr = await tx.prospect.updateMany({
      where: { partnerId: who.partnerId, assignedToId: staffId },
      data: { assignedToId: reassignTo },
    });
    moved = {
      restaurants: r1.count + r2.count,
      pharmacies: p1.count + p2.count,
      prospects: pr.count,
    };

    // The seat is KEPT, not deleted: the audit log names an actor, and deleting
    // the row makes every past action anonymous. Their staff events, attendance
    // and commission statements stay too — a statement that vanishes when
    // somebody leaves is a statement nobody can settle.
    await tx.partnerUser.update({
      where: { id: staffId },
      data: { status: "deactivated", deactivatedAt: new Date() },
      select: { id: true },
    });

    await writeSeatAudit(tx, who, {
      action: "partner.staff_offboarded",
      entityType: "partner_user",
      entityId: staffId,
      before: { email: target.email, role: target.role, status: target.status },
      after: { status: "deactivated", reassignedTo: reassignTo, moved },
    });
  });

  // --- outside the transaction, on purpose (see the doc comment) -------------
  let revoked = true;
  if (target.authUserId) {
    try {
      await createSupabaseAdminClient().auth.admin.signOut(target.authUserId, "global");
    } catch {
      revoked = false;
    }
  }
  if (!revoked) {
    await systemDb((tx) =>
      writeSeatAudit(tx, who, {
        action: "partner.staff_session_revoke_failed",
        entityType: "partner_user",
        entityId: staffId,
        // Said out loud rather than swallowed: the seat cannot sign in again —
        // getCurrentPartner refuses a deactivated row on every request — but an
        // open tab keeps rendering until its token lapses, and somebody should
        // know that happened.
        after: { note: "seat deactivated; existing sessions not revoked" },
      }),
    );
  }

  revalidatePath("/partner/team");
  revalidatePath(`/partner/team/staff/${staffId}`);
  return {
    ok: true,
    error: revoked
      ? undefined
      : "Offboarded and handed over, but we could not sign them out of open devices. They cannot sign in again.",
  };
}

/**
 * Bring somebody back.
 *
 * Reactivation does NOT return their book — the work went to somebody else and
 * taking it back silently would surprise two people at once.
 */
export async function reactivateStaffAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner("team.manage");
  if (!who) return;
  const staffId = String(formData.get("staffId") ?? "");
  const target = await targetSeat(who.partnerId, staffId);
  if (!target || !isPartnerUserRole(target.role)) return;
  if (!canManageSeatRole(who.partner.user.role, target.role)) return;

  await systemDb(async (tx) => {
    await tx.partnerUser.update({
      where: { id: staffId },
      data: { status: "active", deactivatedAt: null },
      select: { id: true },
    });
    await writeSeatAudit(tx, who, {
      action: "partner.staff_reactivated",
      entityType: "partner_user",
      entityId: staffId,
      after: { status: "active" },
    });
  });
  revalidatePath("/partner/team");
  revalidatePath(`/partner/team/staff/${staffId}`);
}
