import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getFloorPlan } from "@/server/tables/floor";
import { FloorPlan } from "@/components/admin/FloorPlan";

/**
 * Visual floor plan — drag tables to arrange the room, see live occupancy from
 * open orders, and flip a table to "needs cleaning" / "reserved" / available.
 */
export default async function FloorPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "floorPlan", "Floor plan");
  if (locked) return locked;
  const tables = await getFloorPlan(restaurantId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Floor plan</h1>
        <p className="text-sm text-plum-ink/50">
          Drag tables to match your room. Occupancy updates live from open orders; tap a table to
          mark it cleaned or reserved.
        </p>
      </div>
      <FloorPlan restaurantId={restaurantId} initialTables={tables} />
    </div>
  );
}
