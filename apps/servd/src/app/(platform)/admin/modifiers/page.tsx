import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getModifierGroups } from "@/server/menu/queries";
import { getModifierAvailability } from "@/server/menu/modifier-availability";
import { AddModifierGroupForm } from "@/components/admin/AddModifierGroupForm";
import { AddModifierForm } from "@/components/admin/AddModifierForm";
import { ModifierRow } from "@/components/admin/ModifierRow";
import { ModifierGroupHeader } from "@/components/admin/ModifierGroupHeader";
import { SortableList } from "@/components/admin/SortableList";
import { reorderModifierGroups } from "@/server/menu/actions";

export default async function ModifiersPage() {
  const { restaurantId } = await requireAdminPage();
  const [groups, availability] = await Promise.all([
    getModifierGroups(restaurantId),
    getModifierAvailability(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/menu" className="text-sm text-plum-ink/50">
          ← Menu
        </Link>
        <h1 className="font-heading text-2xl font-bold">Modifier groups</h1>
        <p className="text-sm text-plum-ink/50">
          Reusable option sets (Size, Add-ons…) you can attach to menu items.
        </p>
      </div>

      <AddModifierGroupForm />

      {groups.length === 0 && (
        <p className="text-sm text-plum-ink/50">No modifier groups yet.</p>
      )}

      {groups.length > 1 && (
        <p className="text-sm text-plum-ink/55">
          Drag ⠿ (or use ▲▼) to set the order. This is the order every menu item asks in — Size
          before Flavour before Add-ons, on every dish that uses them.
        </p>
      )}

      <SortableList
        entries={groups.map((group) => ({
          id: group.id,
          node: (
        <section
          className="rounded-tile border border-plum-ink/10 bg-white p-4"
        >
          <ModifierGroupHeader
            group={{ id: group.id, name: group.name, required: group.required, minSelect: group.minSelect, maxSelect: group.maxSelect }}
          />

          <ul className="mt-3 space-y-1">
            {group.modifiers.map((m) => (
              <ModifierRow
                key={m.id}
                id={m.id}
                name={m.name}
                priceDelta={m.priceDelta}
                isAvailable={availability.get(m.id) ?? true}
              />
            ))}
          </ul>

          <div className="mt-3">
            <AddModifierForm groupId={group.id} />
          </div>
        </section>
          ),
        }))}
        onReorder={reorderModifierGroups}
        className="space-y-6"
      />
    </div>
  );
}
