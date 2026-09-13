"use client";

import { useActionState, useEffect, useRef } from "react";
import { clockByPin } from "@/server/hr/actions";

type Result = { ok?: boolean; status?: "in" | "out"; name?: string; error?: string } | null;

export function ClockPinStation() {
  const [state, action] = useActionState<Result, FormData>(clockByPin, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <div className="mx-auto max-w-xs pt-10 text-center">
      <h1 className="font-heading text-2xl font-bold">Time clock</h1>
      <p className="mt-1 text-sm text-plum-ink/50">Enter your PIN to clock in or out.</p>
      <form ref={ref} action={action} className="mt-6 space-y-3">
        <input
          name="pin"
          inputMode="numeric"
          autoComplete="off"
          placeholder="PIN"
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-3 text-center text-xl tracking-widest"
        />
        <button className="w-full rounded-full py-3 font-semibold btn-brand">Clock in / out</button>
      </form>
      {state?.ok && state.status && (
        <p className="mt-4 font-heading text-lg font-bold text-mango">
          {state.name} clocked {state.status === "in" ? "IN" : "OUT"}
        </p>
      )}
      {state?.error && <p className="mt-4 text-sm text-guava">{state.error}</p>}
    </div>
  );
}
