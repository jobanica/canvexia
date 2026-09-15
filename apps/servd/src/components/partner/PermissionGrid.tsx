import {
  PARTNER_USER_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  PERMISSIONS_WITHOUT_SCREENS,
  type PartnerPermission,
  type PartnerUserRole,
} from "@servd/core";
import type { GridCell } from "@/server/partners/permissions";
import {
  setPermissionAction,
  resetRoleDefaultsAction,
} from "@/server/partners/permissions-actions";

const ROLE_LABELS: Record<PartnerUserRole, string> = {
  admin: "Admin",
  ops_manager: "Ops manager",
  sales: "Sales",
  support: "Support",
};

/**
 * The toggle grid: 29 permissions × 4 roles.
 *
 * A SERVER COMPONENT with one form per cell, not a client component holding
 * draft state. Twenty-nine rows of four toggles with a Save button is a screen
 * where somebody changes six things, loses the tab, and has no idea which of
 * them took effect. Each toggle is its own submit, each is audited, and the
 * page always shows what is actually stored.
 *
 * Three things the cell has to say, which a plain checkbox cannot:
 *  - on or off;
 *  - whether that is the shipped DEFAULT or something this partner chose —
 *    only the second survives a change to the defaults;
 *  - whether it is locked, and locked cells are rendered as text rather than
 *    as a disabled control, because a greyed-out switch invites clicking.
 */
export function PermissionGrid({
  cells,
  seatCounts,
}: {
  cells: GridCell[];
  seatCounts: Record<PartnerUserRole, number>;
}) {
  const byKey = new Map(cells.map((c) => [`${c.role}:${c.permission}`, c]));
  const noScreen = new Set<PartnerPermission>(PERMISSIONS_WITHOUT_SCREENS);

  return (
    <div className="space-y-6">
      <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm text-brand-ink/60">
          These decide what each role can do in this portal. Changes take effect on the
          person&rsquo;s next page load — nobody has to sign out and back in.
        </p>
        <p className="mt-2 text-xs text-brand-ink/45">
          A <strong>Default</strong> cell follows whatever CANVEXIA ships. Once you change
          one it becomes yours and stops moving when the default does.
        </p>
      </div>

      {/* Tables are the one thing allowed to be wider than the phone, in their
          own scroller, rather than stacking four columns into a list nobody can
          compare across. */}
      <div className="overflow-x-auto rounded-tile border border-brand-ink/10 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-ink/10">
              <th className="px-4 py-3 text-left font-semibold">Can</th>
              {PARTNER_USER_ROLES.map((role) => (
                <th key={role} className="px-3 py-3 text-center font-semibold">
                  <span className="block">{ROLE_LABELS[role]}</span>
                  <span className="mt-0.5 block text-[0.65rem] font-normal text-brand-ink/40">
                    {seatCounts[role]} {seatCounts[role] === 1 ? "person" : "people"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <>
                <tr key={group.label} className="bg-brand-surface/60">
                  <td
                    colSpan={PARTNER_USER_ROLES.length + 1}
                    className="px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-brand-ink/45"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.keys.map((permission) => (
                  <tr key={permission} className="border-b border-brand-ink/5 last:border-0">
                    <td className="px-4 py-2.5">
                      <span>{PERMISSION_LABELS[permission]}</span>
                      {noScreen.has(permission) && (
                        // Said on the screen, not just in a comment. A toggle
                        // that controls nothing yet is worth having — the grid
                        // describes the job — but only if it admits it.
                        <span className="ml-2 rounded-full bg-brand-ink/5 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-brand-ink/40">
                          not built yet
                        </span>
                      )}
                    </td>
                    {PARTNER_USER_ROLES.map((role) => {
                      const cell = byKey.get(`${role}:${permission}`);
                      if (!cell) return <td key={role} />;
                      return (
                        <td key={role} className="px-3 py-2.5 text-center">
                          <Cell cell={cell} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        {PARTNER_USER_ROLES.map((role) => (
          <form key={role} action={resetRoleDefaultsAction}>
            <input type="hidden" name="role" value={role} />
            <button className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/60 hover:bg-brand-surface">
              Reset {ROLE_LABELS[role]} to defaults
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

function Cell({ cell }: { cell: GridCell }) {
  if (cell.locked) {
    // Rendered as text, not as a disabled switch. A greyed-out control invites
    // clicking and then says nothing about why it did nothing.
    return (
      <span
        className="inline-flex flex-col items-center"
        title="Always on — removing it would leave nobody able to change these settings"
      >
        <span className="text-brand-primary">✓</span>
        <span className="text-[0.6rem] text-brand-ink/35">always</span>
      </span>
    );
  }

  return (
    <form action={setPermissionAction} className="inline-flex flex-col items-center gap-0.5">
      <input type="hidden" name="role" value={cell.role} />
      <input type="hidden" name="permission" value={cell.permission} />
      <input type="hidden" name="allowed" value={cell.allowed ? "false" : "true"} />
      <button
        aria-pressed={cell.allowed}
        aria-label={`${cell.role}: ${cell.permission}`}
        className={`flex h-6 w-10 items-center rounded-full border px-0.5 transition-colors ${
          cell.allowed
            ? "justify-end border-brand-primary/40 bg-brand-primary/20"
            : "justify-start border-brand-ink/15 bg-brand-ink/5"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full ${
            cell.allowed ? "bg-brand-primary" : "bg-brand-ink/25"
          }`}
        />
      </button>
      <span className="text-[0.6rem] text-brand-ink/35">
        {cell.source === "default" ? "default" : "yours"}
      </span>
    </form>
  );
}
