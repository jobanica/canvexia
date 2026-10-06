import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { ActionForm } from "@/components/ActionForm";
import { manilaDateTime } from "@/lib/time";
import { decideChangeAction } from "./actions";

type Details = { payoutMethod: string; payoutAccountName: string; payoutAccountNumber: string };
const show = (d: Details) => `${d.payoutMethod} · ${d.payoutAccountName} · ${d.payoutAccountNumber}`;

export default async function PayoutChangesPage() {
  await requireAdminPage();
  const changes = await staffDb("admin", (tx) =>
    tx.agentPayoutDetailChange.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: { agent: { select: { name: true, mobile: true } } },
    }),
  );
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Payout detail changes</h1>
      <p className="text-sm text-slate-600">
        Before approving, confirm the change with the agent on their registered mobile — a hijacked
        login asking to be paid somewhere new is the fraud this step stops.
      </p>
      {changes.map((c) => (
        <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p className="font-semibold">{c.agent.name} <span className="font-normal text-slate-500">({c.agent.mobile}) · {manilaDateTime(c.createdAt)} · {c.status}</span></p>
          <p className="mt-1 text-slate-500">From: {show(c.oldValues as Details)}</p>
          <p>To: <strong>{show(c.newValues as Details)}</strong></p>
          {c.status === "pending" && (
            <div className="mt-3 flex gap-3">
              <ActionForm action={decideChangeAction} submitLabel="Approve" confirm="Approve this change? Future payouts go to the new account.">
                <input type="hidden" name="changeId" value={c.id} />
                <input type="hidden" name="decision" value="approve" />
              </ActionForm>
              <ActionForm action={decideChangeAction} submitLabel="Reject" danger>
                <input type="hidden" name="changeId" value={c.id} />
                <input type="hidden" name="decision" value="reject" />
              </ActionForm>
            </div>
          )}
        </div>
      ))}
      {changes.length === 0 && <p className="text-sm text-slate-500">No requests.</p>}
    </div>
  );
}
