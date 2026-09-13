import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { listDueFollowUps } from "@/server/bizops/follow-ups";
import { FollowUpRowItem } from "@/components/super-admin/FollowUpRow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Follow-ups · Servd" };

/**
 * The chase list — the single highest-value screen in this layer.
 *
 * One list, both intake tracks. Longest-waiting first, because a list sorted by
 * due date puts today's easy wins on top and buries the lead that has been
 * ignored for three weeks — and that one is either the biggest save available
 * or the clearest signal to give up on it.
 *
 * Nobody who has paid or activated can appear here. That is enforced in
 * lib/bizops/follow-up.ts at render time rather than trusted from a stage
 * somebody forgot to update, because chasing a customer for money they already
 * sent is the one mistake on this screen that costs trust rather than time.
 */
export default async function FollowUpsPage() {
  await requireSuperAdminPage();
  const rows = await listDueFollowUps();
  const diy = rows.filter((r) => r.track === "diy_preview");
  const outreach = rows.filter((r) => r.track === "outreach");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super-admin/bizops" className="text-sm text-plum-ink/50">
          ← Business
        </Link>
        <h1 className="font-heading text-2xl font-bold">Follow-up centre</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Everyone due a chase today, longest-waiting first. Copy the message, send it from
          Messenger yourself, then mark it — Servd never messages anyone on your behalf.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-8 text-center">
          <p className="text-2xl">✅</p>
          <p className="mt-2 text-sm text-plum-ink/55">
            Nobody is waiting on you. Everything due has been followed up.
          </p>
        </div>
      ) : (
        <>
          {diy.length > 0 && (
            <Group
              title={`Built a preview, never paid (${diy.length})`}
              blurb="The warmest leads you have — they did the work and stopped at the payment screen."
              rows={diy}
            />
          )}
          {outreach.length > 0 && (
            <Group
              title={`Outreach (${outreach.length})`}
              blurb="Cold prospects from the CRM. Marking one here advances its sequence, same as the CRM board."
              rows={outreach}
            />
          )}
        </>
      )}
    </div>
  );
}

function Group({
  title,
  blurb,
  rows,
}: {
  title: string;
  blurb: string;
  rows: Awaited<ReturnType<typeof listDueFollowUps>>;
}) {
  return (
    <div>
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      <p className="mb-2 text-xs text-plum-ink/50">{blurb}</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <FollowUpRowItem key={`${r.track}-${r.id}`} row={r} />
        ))}
      </div>
    </div>
  );
}
