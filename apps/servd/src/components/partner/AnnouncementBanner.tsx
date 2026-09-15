import { markAnnouncementReadAction } from "@/server/partners/announcements-action";

const TONE: Record<string, string> = {
  info: "border-brand-ink/12 bg-white",
  warning: "border-brand-accent/35 bg-brand-accent/[0.05]",
  incident: "border-guava/40 bg-guava/[0.05]",
};

/**
 * What HQ has posted, in the partner's portal.
 *
 * MARKDOWN IS RENDERED AS TEXT, not HTML. The body is written by HQ and this is
 * still not a reason to reach for dangerouslySetInnerHTML: a console with more
 * than one seat is a console where somebody's account can be taken, and the
 * blast radius of stored XSS here is every partner in the country. Line breaks
 * and paragraphs are what the copy actually needs; anything richer can wait for
 * a real renderer.
 *
 * The read receipt is a form, not a fetch on render: marking something read as
 * a side effect of looking at a list means every partner reads everything the
 * moment they open the portal, and the receipt stops meaning anything.
 */
export function AnnouncementBanner({
  items,
}: {
  items: { id: string; title: string; body: string; level: string; publishedAt: Date; read: boolean }[];
}) {
  const unread = items.filter((i) => !i.read);
  if (unread.length === 0) return null;

  return (
    <div className="mb-5 space-y-3">
      {unread.map((a) => (
        <div key={a.id} className={`rounded-tile border p-4 ${TONE[a.level] ?? TONE.info}`}>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-heading text-base font-bold">{a.title}</span>
            <span className="text-xs text-brand-ink/40">
              {a.publishedAt.toLocaleDateString("en-PH", { dateStyle: "medium" })}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink/70">{a.body}</p>
          <form action={markAnnouncementReadAction} className="mt-2">
            <input type="hidden" name="id" value={a.id} />
            <button className="rounded-full border border-brand-ink/15 bg-white px-3 py-1 text-xs font-semibold hover:bg-brand-surface">
              Got it
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
