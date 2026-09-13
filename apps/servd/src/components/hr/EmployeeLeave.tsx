"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestMyLeave, type MyLeave } from "@/server/hr/employee-portal";

export function EmployeeLeave({ leave }: { leave: MyLeave }) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(leave.types[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await requestMyLeave(typeId, start, end);
    setBusy(false);
    if (res.ok) {
      setMsg("Request submitted — pending approval.");
      setStart("");
      setEnd("");
      router.refresh();
    } else {
      setError(res.error ?? "Couldn't submit.");
    }
  }

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h2 className="font-heading text-lg font-bold">Leave</h2>

      {leave.balances.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {leave.balances.map((b) => (
            <li key={b.type} className="rounded-full bg-cream px-3 py-1">
              {b.type}: <span className="font-semibold">{b.balance} days</span>
            </li>
          ))}
        </ul>
      )}

      {leave.types.length === 0 ? (
        <p className="mt-3 text-sm text-plum-ink/50">No leave types set up yet. Ask your manager.</p>
      ) : (
        <div className="mt-4 space-y-2">
          <select
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          >
            {leave.types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-guava">{error}</p>}
          {msg && <p className="text-sm text-mango">{msg}</p>}
          <button
            onClick={submit}
            disabled={busy || !typeId || !start || !end}
            className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Request leave"}
          </button>
        </div>
      )}

      {leave.requests.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {leave.requests.map((r) => (
            <li key={r.id} className="flex justify-between">
              <span>
                {r.type} · {new Date(r.startDate).toLocaleDateString()}–{new Date(r.endDate).toLocaleDateString()}
              </span>
              <span
                className={
                  r.status === "approved" ? "text-mango" : r.status === "rejected" ? "text-guava" : "text-plum-ink/50"
                }
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
