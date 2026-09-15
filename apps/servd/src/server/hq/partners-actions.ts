"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";
import { requireHqAction } from "./auth";
import { createImpersonationGrant } from "./impersonate";

/**
 * HQ's actions on a partner.
 *
 * TWO RULES APPLY TO EVERY FUNCTION HERE, and they are not the same rule:
 *
 *  1. The CAPABILITY is re-checked at the action. Hiding a button is a
 *     courtesy; a server action is reachable by its id from any page, so an ops
 *     admin who never saw the suspend button can still POST to it. That is what
 *     `requireHqAction` refuses.
 *
 *  2. A TYPED CONFIRMATION is required for anything destructive. Not a
 *     `confirm()` in the browser — the check is here, against the partner's
 *     actual name, because a client-side dialog is a suggestion.
 */

export type HqPartnerState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * Does the typed text match the partner's name?
 *
 * Case- and whitespace-insensitive. The point is to make somebody read the name
 * of the partner they are about to suspend, not to test their typing.
 */
function confirms(typed: string, name: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(typed) === norm(name) && norm(typed).length > 0;
}

export async function setPartnerStatusAction(
  _prev: HqPartnerState,
  formData: FormData,
): Promise<HqPartnerState> {
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const typed = String(formData.get("confirm") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!["approved", "suspended", "rejected", "pending"].includes(status)) {
    return { status: "error", message: "That is not a status." };
  }

  // Suspension is the destructive one — it cuts an operator out of a console
  // they run a business from. Approving is not, so it does not demand a reason
  // or the typed name.
  const destructive = status === "suspended" || status === "rejected";
  const capability = destructive ? "partners.suspend" : "partners.write";

  let actor;
  try {
    actor = await requireHqAction(capability);
  } catch {
    return {
      status: "error",
      message: destructive
        ? "Only a super admin can suspend a partner."
        : "You do not have permission to change a partner's status.",
    };
  }

  try {
    const message = await systemDb(async (tx) => {
      const p = await tx.partner.findUnique({
        where: { id: partnerId },
        select: { id: true, name: true, status: true },
      });
      if (!p) throw new Error("NO_PARTNER");
      if (p.status === status) return `${p.name} is already ${status}.`;

      if (destructive) {
        if (!confirms(typed, p.name)) throw new Error("CONFIRM");
        if (reason.length < 4) throw new Error("REASON");
      }

      await tx.partner.update({ where: { id: partnerId }, data: { status } });
      await writeHqAudit(tx, {
        partnerId,
        actorEmail: actor.email,
        action: `partner.${status}`,
        entityType: "partner",
        entityId: partnerId,
        reason: reason || null,
        before: { status: p.status },
        after: { status },
      });
      return `${p.name} is now ${status}.`;
    });

    revalidatePath(`/hq/partners/${partnerId}`);
    revalidatePath("/hq/partners");
    revalidatePath("/hq");
    return { status: "done", message };
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why === "NO_PARTNER") return { status: "error", message: "That partner no longer exists." };
    if (why === "CONFIRM") {
      return { status: "error", message: "Type the partner's name exactly to confirm." };
    }
    if (why === "REASON") {
      return { status: "error", message: "Say why. This is recorded and the partner may ask." };
    }
    return { status: "error", message: "Could not change the status. Try again." };
  }
}

/**
 * Revoke exclusivity: the territory goes back on the market.
 *
 * Three things happen together or none do — the partner's expiry is cleared,
 * the territory is released, and the assignment row is closed. A partner whose
 * exclusivity was revoked but whose territory still reads `taken` is a city
 * nobody can sell and nobody can tell why.
 */
export async function revokeExclusivityAction(
  _prev: HqPartnerState,
  formData: FormData,
): Promise<HqPartnerState> {
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const typed = String(formData.get("confirm") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  let actor;
  try {
    actor = await requireHqAction("partners.suspend");
  } catch {
    return { status: "error", message: "Only a super admin can revoke exclusivity." };
  }

  try {
    const message = await systemDb(async (tx) => {
      const p = await tx.partner.findUnique({
        where: { id: partnerId },
        select: { id: true, name: true, exclusivityExpiresAt: true, territoryId: true },
      });
      if (!p) throw new Error("NO_PARTNER");
      if (!confirms(typed, p.name)) throw new Error("CONFIRM");
      if (reason.length < 4) throw new Error("REASON");

      await tx.partner.update({
        where: { id: partnerId },
        data: { exclusivityExpiresAt: null },
      });

      // Close the open assignment and put the city back. `releasedAt` is what
      // the partial unique index keys on, so this is also what lets the
      // territory be assigned to somebody else.
      const open = await tx.territoryAssignment.findFirst({
        where: { partnerId, releasedAt: null },
        select: { id: true, territoryId: true },
      });
      if (open) {
        await tx.territoryAssignment.update({
          where: { id: open.id },
          data: { releasedAt: new Date(), reason, actorEmail: actor.email },
        });
        await tx.territory.update({
          where: { id: open.territoryId },
          data: { status: "available", partnerId: null, assignedAt: null },
        });
      }

      await writeHqAudit(tx, {
        partnerId,
        actorEmail: actor.email,
        action: "partner.exclusivity_revoked",
        entityType: "partner",
        entityId: partnerId,
        reason,
        before: { exclusivityExpiresAt: p.exclusivityExpiresAt?.toISOString() ?? null },
        after: { exclusivityExpiresAt: null, territoryReleased: open?.territoryId ?? null },
      });

      return open
        ? `${p.name} no longer holds their territory. It is available again.`
        : `${p.name}'s exclusivity is revoked. They held no assigned territory.`;
    });

    revalidatePath(`/hq/partners/${partnerId}`);
    revalidatePath("/hq/territories");
    revalidatePath("/hq");
    return { status: "done", message };
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why === "NO_PARTNER") return { status: "error", message: "That partner no longer exists." };
    if (why === "CONFIRM") {
      return { status: "error", message: "Type the partner's name exactly to confirm." };
    }
    if (why === "REASON") {
      return { status: "error", message: "Say why. The partner is told this reason." };
    }
    return { status: "error", message: "Could not revoke exclusivity. Try again." };
  }
}

/** Extend exclusivity by a date HQ picks. Not destructive; no typed name. */
export async function extendExclusivityAction(
  _prev: HqPartnerState,
  formData: FormData,
): Promise<HqPartnerState> {
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const until = String(formData.get("until") ?? "").trim();

  let actor;
  try {
    actor = await requireHqAction("partners.write");
  } catch {
    return { status: "error", message: "You do not have permission to change licence terms." };
  }

  const date = until ? new Date(`${until}T00:00:00+08:00`) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { status: "error", message: "Pick a date." };
  }
  if (date.getTime() <= Date.now()) {
    return { status: "error", message: "That date has already passed." };
  }

  try {
    await systemDb(async (tx) => {
      const p = await tx.partner.findUnique({
        where: { id: partnerId },
        select: { exclusivityExpiresAt: true },
      });
      await tx.partner.update({
        where: { id: partnerId },
        data: { exclusivityExpiresAt: date },
      });
      await writeHqAudit(tx, {
        partnerId,
        actorEmail: actor.email,
        action: "partner.exclusivity_extended",
        entityType: "partner",
        entityId: partnerId,
        before: { exclusivityExpiresAt: p?.exclusivityExpiresAt?.toISOString() ?? null },
        after: { exclusivityExpiresAt: date.toISOString() },
      });
    });
    revalidatePath(`/hq/partners/${partnerId}`);
    return { status: "done", message: `Exclusivity now runs to ${until}.` };
  } catch {
    return { status: "error", message: "Could not save that date." };
  }
}

/**
 * Open a read-only "view as partner" session.
 *
 * Redirects INTO the redeem route rather than returning the token to the page:
 * the token would otherwise sit in this action's serialized result and in the
 * browser's history. Redeeming immediately also means the 30-minute clock
 * starts when the session does, not when the button was rendered.
 */
export async function viewAsPartnerAction(
  _prev: HqPartnerState,
  formData: FormData,
): Promise<HqPartnerState> {
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "");

  const grant = await createImpersonationGrant({ partnerId, reason });
  if (!grant.ok) return { status: "error", message: grant.error };

  redirect(`/partner/view-as/${grant.token}`);
}
