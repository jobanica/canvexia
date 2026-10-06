import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { AGENT_TONE as TONE, Badge } from "@/components/AdminShell";
import { ActionForm } from "@/components/ActionForm";
import { actionsFor, type AgentAction } from "@/lib/agent-status";
import { manilaDateTime } from "@/lib/time";
import { agentStatusAction } from "../actions";

const LABEL: Record<AgentAction, string> = {
  approve: "Approve",
  reject: "Reject application",
  suspend: "Suspend",
  reinstate: "Reinstate",
  remove: "Remove",
};
const CONFIRM: Partial<Record<AgentAction, string>> = {
  reject: "Reject this application? This cannot be undone.",
  remove: "Remove this agent? Their code stops attaching new customers. This cannot be undone.",
  suspend: "Suspend this agent? New sign-ups with their code will not be credited to them.",
};

export default async function AgentDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const agent = await staffDb("admin", (tx) =>
    tx.agent.findUnique({ where: { id }, include: { _count: { select: { referrals: true } } } }),
  ).catch(() => null);
  if (!agent) notFound();

  const rows: [string, React.ReactNode][] = [
    ["Referral code", <span key="c" className="font-mono">{agent.referralCode}</span>],
    ["Email", agent.email],
    ["Mobile", agent.mobile],
    ["Payout", `${agent.payoutMethod} · ${agent.payoutAccountName} · ${agent.payoutAccountNumber}`],
    ["Agreement", `v${agent.agreementVersion}, accepted ${manilaDateTime(agent.agreementAcceptedAt)}`],
    ["Applied", manilaDateTime(agent.createdAt)],
    ["Approved", agent.approvedAt ? `${manilaDateTime(agent.approvedAt)} by ${agent.approvedBy}` : "—"],
    ["Customers", agent._count.referrals],
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">
        {agent.name} <Badge tone={TONE[agent.status]}>{agent.status}</Badge>
      </h1>
      <dl className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-2 px-4 py-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className="col-span-2">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-3">
        {actionsFor(agent.status).map((a) => (
          <ActionForm
            key={a}
            action={agentStatusAction}
            submitLabel={LABEL[a]}
            danger={a === "reject" || a === "remove" || a === "suspend"}
            confirm={CONFIRM[a]}
            className="space-y-2"
          >
            <input type="hidden" name="agentId" value={agent.id} />
            <input type="hidden" name="action" value={a} />
          </ActionForm>
        ))}
      </div>
    </div>
  );
}
