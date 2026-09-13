"use server";

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { writeAudit } from "@/server/audit/log";

/**
 * Mark a dish sold out (or back on) FROM THE TILL.
 *
 * The menu editor has had this switch since the beginning, but only the owner
 * can reach it. Lechon runs out at seven on a Saturday and the owner isn't in
 * the shop — so either a cashier keeps taking orders the kitchen can't cook, or
 * somebody rings the owner to log in. This is the same switch, exposed to the
 * person who is actually standing there when it runs out.
 *
 * Deliberately its own module rather than a role tweak to
 * `toggleItemAvailability` in server/menu/actions.ts: that file is the owner's
 * menu editor and every action in it is admin-only. Widening one of them would
 * put a cashier one formData field away from the rest, and the next person
 * reading `requireAdminAction()` at the top would reasonably assume it still
 * held. Same write, same audit vocabulary, separate door.
 */
export type PosStockResult = { ok: true } | { error: string };

export async function setPosItemAvailability(
  itemId: string,
  available: boolean,
): Promise<PosStockResult> {
  // Exactly the roles the rest of the POS runs as (see server/orders/cashier.ts).
  const staff = await requireStaff(["cashier", "admin"]);
  const id = itemId.trim();
  if (!id) return { error: "No item." };

  try {
    return await tenantDb(staff.restaurantId, async (tx) => {
      // Scoped by restaurantId as well as id. RLS already fences the tenant off,
      // but an item id arriving from the browser is untrusted input and this
      // costs nothing.
      const item = await tx.menuItem.findFirst({
        where: { id, restaurantId: staff.restaurantId },
        select: { id: true, name: true, isAvailable: true },
      });
      if (!item) return { error: "That item is no longer on the menu." };
      if (item.isAvailable === available) return { ok: true } as const;

      await tx.menuItem.update({
        where: { id: item.id },
        data: { isAvailable: available },
        select: { id: true },
      });

      // Taking a seller off the menu mid-service is worth a line saying who did
      // it — more so from the till than from the office, because now anyone on
      // shift can. Same two actions the menu editor writes, so the audit log
      // renders them without knowing where the tap came from.
      await writeAudit(tx, staff.restaurantId, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: available ? "menu.item_available" : "menu.item_unavailable",
        entityType: "menu_item",
        entityId: item.id,
        before: { name: item.name, isAvailable: item.isAvailable },
        after: { name: item.name, isAvailable: available, source: "pos" },
      });

      return { ok: true } as const;
    });
  } catch {
    return { error: "Couldn't update it just now. Try again." };
  } finally {
    // The owner's menu list shows the same switch; keep the two in step.
    revalidatePath("/admin/menu");
  }
}
