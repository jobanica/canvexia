import { requireAgentPage } from "@/lib/agent-page";
import { agentDb } from "@/server/scoped-db";
import { AgentShell } from "@/components/AgentShell";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { PAYOUT_METHODS } from "@/lib/application";
import { manilaDate } from "@/lib/time";
import { requestChangeAction } from "./actions";

export default async function ProfilePage() {
  const agent = await requireAgentPage("/profile");
  const { me, changes } = await agentDb(agent.agentId, async (tx) => ({
    me: await tx.agent.findUniqueOrThrow({ where: { id: agent.agentId } }),
    changes: await tx.agentPayoutDetailChange.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  }));
  const pending = changes.find((c) => c.status === "pending");

  return (
    <AgentShell agent={agent}>
      <h1 className="text-xl font-semibold">Profile</h1>
      <dl className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <div><dt className="inline text-slate-500">Name: </dt><dd className="inline">{me.name}</dd></div>
        <div><dt className="inline text-slate-500">Mobile: </dt><dd className="inline">{me.mobile}</dd></div>
        <div><dt className="inline text-slate-500">Email: </dt><dd className="inline">{me.email}</dd></div>
        <div><dt className="inline text-slate-500">Code: </dt><dd className="inline font-mono">{me.referralCode}</dd></div>
        <div><dt className="inline text-slate-500">Paid to: </dt><dd className="inline">{me.payoutMethod} · {me.payoutAccountName} · {me.payoutAccountNumber}</dd></div>
        <div><dt className="inline text-slate-500">Agreement: </dt><dd className="inline">version {me.agreementVersion}, accepted {manilaDate(me.agreementAcceptedAt)}</dd></div>
      </dl>

      <h2 className="mt-6 font-semibold">Change where you are paid</h2>
      {pending ? (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          Your request from {manilaDate(pending.createdAt)} is waiting for an admin.
        </p>
      ) : (
        <ActionForm action={requestChangeAction} submitLabel="Request change" className="mt-2 space-y-3">
          <Field label="Payout method">
            <select name="payoutMethod" defaultValue="GCash" className={inputClass}>
              {PAYOUT_METHODS.map((m) => <option key={m} value={m}>{m === "Bank" ? "Bank transfer" : m}</option>)}
            </select>
          </Field>
          <Field label="Bank name" hint="Only for bank transfer."><input name="bankName" className={inputClass} /></Field>
          <Field label="Account name"><input name="payoutAccountName" required className={inputClass} /></Field>
          <Field label="Account or mobile number"><input name="payoutAccountNumber" required inputMode="numeric" className={inputClass} /></Field>
        </ActionForm>
      )}
      {changes.filter((c) => c.status !== "pending").length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-slate-500">
          {changes.filter((c) => c.status !== "pending").map((c) => (
            <li key={c.id}>Request of {manilaDate(c.createdAt)}: {c.status}</li>
          ))}
        </ul>
      )}
    </AgentShell>
  );
}
