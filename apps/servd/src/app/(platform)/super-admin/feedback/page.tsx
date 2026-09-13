import { listPlatformFeedback } from "@/server/platform-feedback/queries";
import { setFeedbackResolved } from "@/server/platform-feedback/actions";
import { manilaDateTime } from "@/lib/time/manila";
import { FeedbackReply } from "@/components/super-admin/FeedbackReply";

/**
 * Whether an answer will also reach them by email.
 *
 * A DIY account signs in with a synthetic address at staff.servdph.com — a real
 * auth row, but not an inbox. The reply form says which it is, so nobody writes
 * a careful answer believing it was emailed when it wasn't.
 */
function isRealInbox(email: string | null): boolean {
  if (!email || !email.includes("@")) return false;
  return !email.toLowerCase().endsWith("@staff.servdph.com");
}

export default async function SuperAdminFeedbackPage() {
  const items = await listPlatformFeedback();
  const open = items.filter((i) => !i.resolved);
  const done = items.filter((i) => i.resolved);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Feedback</h1>
        <p className="text-sm text-plum-ink/50">
          What restaurant owners are saying about Servd — sent from their dashboard.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-plum-ink/50">No feedback yet.</p>
      ) : (
        <>
          <Section title={`Open (${open.length})`} rows={open} />
          {done.length > 0 && <Section title={`Resolved (${done.length})`} rows={done} resolved />}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  rows,
  resolved = false,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof listPlatformFeedback>>;
  resolved?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 font-heading text-lg font-bold">{title}</h2>
      <div className="space-y-3">
        {rows.map((f) => (
          <div
            key={f.id}
            className={`rounded-tile border bg-white p-4 ${resolved ? "border-plum-ink/10 opacity-70" : "border-plum-ink/10"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-semibold">{f.restaurantName ?? "Unknown restaurant"}</span>
                {f.rating ? <span className="ml-2 text-mango">{"★".repeat(f.rating)}</span> : null}
                <span className="block text-xs text-plum-ink/40">
                  {f.authorEmail ?? "—"} · {manilaDateTime(f.createdAt)}
                </span>
              </div>
              <form action={setFeedbackResolved}>
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="resolved" value={(!f.resolved).toString()} />
                <button className="rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold hover:bg-cream">
                  {f.resolved ? "Reopen" : "Mark resolved"}
                </button>
              </form>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-plum-ink/80">{f.message}</p>
            <FeedbackReply
              id={f.id}
              reply={f.reply}
              repliedAt={f.repliedAt}
              replyReadAt={f.replyReadAt}
              emailable={isRealInbox(f.authorEmail)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
