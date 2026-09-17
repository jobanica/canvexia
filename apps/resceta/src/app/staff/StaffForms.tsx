"use client";

import { useActionState } from "react";
import { addStaffAction, removeStaffAction, type StaffState } from "./actions";
import { PHARMACY_ROLES, ROLE_LABEL } from "@/lib/pharmacy/roles";

const IDLE: StaffState = { status: "idle" };

export function AddStaffForm() {
  const [state, action, pending] = useActionState(addStaffAction, IDLE);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded border border-white/15 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Name</span>
          <input name="displayName" className="w-full rounded border border-white/15 px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Temporary password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full rounded border border-white/15 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Role</span>
          <select name="role" defaultValue="cashier" className="w-full rounded border border-white/15 px-2 py-1.5">
            {PHARMACY_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === "error" && (
        <p role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-sm text-emerald-200">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md brand-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

export function RemoveStaffButton({ staffId }: { staffId: string }) {
  const [state, action, pending] = useActionState(removeStaffAction, IDLE);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="staffId" value={staffId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-slate-500 hover:text-red-300 hover:underline disabled:opacity-40"
      >
        Remove
      </button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-red-300">
          {state.message}
        </span>
      )}
    </form>
  );
}
