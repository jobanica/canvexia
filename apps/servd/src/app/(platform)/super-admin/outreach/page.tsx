import { listClients } from "@/server/crm/queries";
import { listOutreachVideos } from "@/server/outreach/queries";
import { OutreachClient } from "@/components/super-admin/OutreachClient";

export const metadata = { title: "Outreach videos · Servd" };

export default async function OutreachPage() {
  const [clients, history] = await Promise.all([listClients(), listOutreachVideos()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Outreach videos</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Pick a prospect, scan the QR with your phone, and record a short personalized intro
          (their name + their pain). We stitch it into one vertical MP4 — download it here and send
          it on Messenger yourself.
        </p>
      </div>
      <OutreachClient
        clients={clients.map((c) => ({ id: c.id, name: c.name, stage: c.stage }))}
        history={history}
        workerConfigured={!!process.env.WORKER_URL}
      />
    </div>
  );
}
