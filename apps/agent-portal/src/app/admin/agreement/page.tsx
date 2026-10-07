import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { ActionForm } from "@/components/ActionForm";
import { Badge } from "@/components/AdminShell";
import { manilaDateTime } from "@/lib/time";
import { publishAgreementAction } from "./actions";

export default async function AgreementPage() {
  await requireAdminPage();
  const versions = await staffDb("admin", (tx) =>
    tx.agentContractTemplate.findMany({
      where: { kind: "agent", productId: null },
      orderBy: { version: "desc" },
    }),
  );
  const active = versions.find((v) => v.active);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Agent agreement</h1>
        <p className="mt-1 text-sm text-slate-600">
          What an applicant accepts. Applications are closed until a version is published. Publishing
          creates a new version; agents keep the version they accepted.
        </p>
      </div>
      <ActionForm action={publishAgreementAction} submitLabel="Publish as new version" confirm="Publish this as the new agent agreement?">
        <textarea name="body" rows={16} defaultValue={active?.body ?? ""} className="w-full rounded-md border border-slate-300 p-3 font-mono text-sm" />
      </ActionForm>
      <ul className="space-y-1 text-sm">
        {versions.map((v) => (
          <li key={v.id}>
            Version {v.version} · {manilaDateTime(v.createdAt)} {v.active && <Badge tone="green">active</Badge>}
          </li>
        ))}
      </ul>
    </div>
  );
}
