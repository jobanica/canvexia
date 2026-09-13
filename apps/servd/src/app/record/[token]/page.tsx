import { getRecordContext } from "@/server/outreach/record";
import { RecordClient } from "@/components/outreach/RecordClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record — Servd" };

export default async function RecordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getRecordContext(token);

  if (!ctx.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-plum-ink px-6 text-center text-white">
        <p className="text-4xl">🔗</p>
        <h1 className="font-heading text-xl font-bold">This link has expired</h1>
        <p className="max-w-xs text-sm text-white/70">
          Recording links last 30 minutes and can only be used once. Generate a new QR code from the
          dashboard and scan it again.
        </p>
      </div>
    );
  }

  return <RecordClient token={token} clientName={ctx.clientName ?? "this restaurant"} />;
}
