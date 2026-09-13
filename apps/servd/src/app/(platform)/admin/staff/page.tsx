import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { listStaff } from "@/server/staff/queries";
import { AddStaffForm } from "@/components/admin/AddStaffForm";
import { StaffCredentials } from "@/components/admin/StaffCredentials";
import { updateStaffRole, deleteStaff } from "@/server/staff/actions";

const ROLES = ["cashier", "kitchen", "merchant", "manager", "admin"] as const;
const ACCESS: Record<string, string> = {
  admin: "Full dashboard",
  manager: "Menu, service, marketing & back office — not settings",
  cashier: "Cashier POS only",
  kitchen: "Kitchen display only",
  merchant: "Incoming online orders only",
};

export default async function StaffPage() {
  const { restaurantId } = await requireAdminPage();
  const me = await getCurrentUser();
  const staff = await listStaff(restaurantId);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Staff &amp; access</h1>
        <p className="text-sm text-plum-ink/55">
          Each person gets their own login. Their <strong>role</strong> controls what
          they can open.
        </p>
      </div>

      {/* Role legend */}
      <div className="grid gap-2 rounded-tile border border-plum-ink/10 bg-white p-4 sm:grid-cols-2">
        {ROLES.map((r) => (
          <p key={r} className="text-sm">
            <span className="font-semibold capitalize">{r}</span>
            <span className="text-plum-ink/50"> — {ACCESS[r]}</span>
          </p>
        ))}
      </div>

      <AddStaffForm />

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr><th className="p-3">Person</th><th>Role / access</th><th></th></tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const isMe = me?.kind === "staff" && me.staffUserId === s.id;
              return (
                <tr key={s.id} className="border-t border-plum-ink/10">
                  <td className="p-3">
                    {s.displayName || s.email}
                    <span className="block text-xs text-plum-ink/40">{s.email}{isMe && " · you"}</span>
                  </td>
                  <td>
                    {isMe ? (
                      <span className="capitalize">{s.role}</span>
                    ) : (
                      <form action={updateStaffRole} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={s.id} />
                        <select name="role" defaultValue={s.role} className="rounded-lg border border-plum-ink/15 px-2 py-1 text-xs">
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button className="text-xs font-semibold text-brand-primary">save</button>
                      </form>
                    )}
                  </td>
                  <td className="align-top">
                    {!isMe && (
                      <div className="space-y-2 py-2">
                        <StaffCredentials id={s.id} email={s.email} />
                        <form action={deleteStaff}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className="text-xs text-muted hover:text-guava">remove</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
