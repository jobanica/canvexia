"use client";

import { useActionState } from "react";
import { addStaffAction, removeStaffAction, type StaffState } from "./actions";
import { PHARMACY_ROLES, ROLE_LABEL } from "@/lib/pharmacy/roles";

const IDLE: StaffState = { status: "idle" };

export function AddStaffForm() {
  const [state, action, pending] = useActionState(addStaffAction, IDLE);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Name</span>
          <input name="displayName" className="w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Temporary password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Role</span>
          <select name="role" defaultValue="cashier" className="w-full rounded border border-slate-300 px-2 py-1.5">
            {PHARMACY_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === "error" && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
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
        className="text-xs text-slate-500 hover:text-red-700 hover:underline disabled:opacity-40"
      >
        Remove
      </button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-red-700">
          {state.message}
        </span>
      )}
    </form>
  );
}
