"use client";

import { useActionState, useState } from "react";
import { resetStaffPassword, updateStaffEmail, type StaffCredState } from "@/server/staff/actions";

function Notice({ state }: { state: StaffCredState }) {
  if (!state) return null;
  if (state.error) return <p className="text-xs text-guava">{state.error}</p>;
  if (state.ok) return <p className="text-xs text-mango">{state.message ?? "Saved."}</p>;
  return null;
}

export function StaffCredentials({ id, email }: { id: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [pwState, pwAction] = useActionState<StaffCredState, FormData>(resetStaffPassword, null);
  const [emailState, emailAction] = useActionState<StaffCredState, FormData>(updateStaffEmail, null);

  const input = "w-full rounded-lg border border-plum-ink/15 px-2 py-1 text-xs";

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-brand-primary">
        {open ? "close" : "login"}
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-plum-ink/10 bg-cream/50 p-2">
          <form action={pwAction} className="space-y-1">
            <input type="hidden" name="id" value={id} />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-plum-ink/40">New password</p>
            <div className="flex gap-1">
              <input name="password" type="text" placeholder="min 8 chars" className={input} autoComplete="off" />
              <button className="rounded-lg bg-plum-ink px-2 py-1 text-xs font-semibold text-white">set</button>
            </div>
            <Notice state={pwState} />
          </form>
          <form action={emailAction} className="space-y-1">
            <input type="hidden" name="id" value={id} />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-plum-ink/40">Email</p>
            <div className="flex gap-1">
              <input name="email" type="email" defaultValue={email} className={input} />
              <button className="rounded-lg bg-plum-ink px-2 py-1 text-xs font-semibold text-white">save</button>
            </div>
            <Notice state={emailState} />
          </form>
        </div>
      )}
    </div>
  );
}
