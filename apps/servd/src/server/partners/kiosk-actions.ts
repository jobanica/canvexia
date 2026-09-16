"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { createKiosk, updateKiosk } from "./kiosk";

export type KioskState = { ok?: boolean; error?: string } | null;

/**
 * Kiosks are a MANAGER's tool, gated on `attendance.view_all`.
 *
 * The same permission that lets somebody see the whole team's attendance is the
 * one that lets them decide where it can be clocked. A salesperson holding
 * `attendance.checkin` may use a kiosk and may not create one — otherwise the
 * rule "you must clock in here" is one anybody could rewrite.
 */
async function manager() {
  return requireWritablePartner("attendance.view_all");
}

function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function createKioskAction(
  _prev: KioskState,
  formData: FormData,
): Promise<KioskState> {
  const who = await manager();
  if (!who) return { error: "Only a manager can add a kiosk." };

  const label = String(formData.get("label") ?? "");
  const result = await createKiosk(who.partnerId, {
    label,
    lat: num(formData, "lat"),
    lng: num(formData, "lng"),
  });
  if (!result.ok) return { error: result.message };

  await systemDb((tx) =>
    writeSeatAudit(tx, who, {
      action: "attendance.kiosk_created",
      entityType: "attendance_kiosk",
      entityId: result.id,
      // The label, never the secret.
      after: { label: label.trim().slice(0, 80) },
    }),
  );

  revalidatePath("/partner/attendance/kiosk");
  revalidatePath("/partner/attendance/manager");
  return { ok: true };
}

/**
 * Switch a kiosk off, back on, or give it a new secret.
 *
 * ROTATE IS THE ANSWER TO A PHOTOGRAPHED SCREEN and it is audited for that
 * reason: it is the action somebody takes after a problem, and the log is what
 * makes "we rotated it that afternoon" checkable later.
 */
export async function updateKioskAction(
  _prev: KioskState,
  formData: FormData,
): Promise<KioskState> {
  const who = await manager();
  if (!who) return { error: "Only a manager can do that." };

  const kioskId = String(formData.get("kioskId") ?? "").trim();
  const intent = String(formData.get("intent") ?? "");
  const change =
    intent === "rotate"
      ? { rotate: true }
      : intent === "activate"
        ? { active: true }
        : intent === "deactivate"
          ? { active: false }
          : null;
  if (!kioskId || !change) return { error: "Nothing to do." };

  const done = await updateKiosk(who.partnerId, kioskId, change);
  if (!done) return { error: "We can't find that kiosk." };

  await systemDb((tx) =>
    writeSeatAudit(tx, who, {
      action: `attendance.kiosk_${intent}`,
      entityType: "attendance_kiosk",
      entityId: kioskId,
    }),
  );

  revalidatePath("/partner/attendance/kiosk");
  revalidatePath(`/partner/attendance/kiosk/${kioskId}`);
  return { ok: true };
}

/**
 * Require this seat to clock in at a kiosk, or stop requiring it.
 *
 * `team.manage`, not `attendance.view_all`: this edits a person's seat, and it
 * belongs with the rest of the staff record rather than with the hardware.
 */
export async function setKioskRequiredAction(
  _prev: KioskState,
  formData: FormData,
): Promise<KioskState> {
  const who = await requireWritablePartner("team.manage");
  if (!who) return { error: "Only a manager can do that." };

  const seatId = String(formData.get("seatId") ?? "").trim();
  const required = String(formData.get("required") ?? "") === "1";
  if (!seatId) return { error: "Nothing to do." };

  try {
    const r = await systemDb((tx) =>
      tx.partnerUser.updateMany({
        where: { id: seatId, partnerId: who.partnerId },
        data: { kioskRequired: required },
      }),
    );
    if (r.count === 0) return { error: "We can't find that person." };
  } catch {
    return { error: "Could not save that." };
  }

  await systemDb((tx) =>
    writeSeatAudit(tx, who, {
      action: "team.kiosk_required",
      entityType: "partner_user",
      entityId: seatId,
      after: { kioskRequired: required },
    }),
  );

  revalidatePath(`/partner/team/staff/${seatId}`);
  return { ok: true };
}
