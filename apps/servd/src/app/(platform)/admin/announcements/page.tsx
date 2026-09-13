import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { listAnnouncements } from "@/server/announcements/queries";
import { markAnnouncementsRead } from "@/server/announcements/actions";
import { manilaDateTime } from "@/lib/time/manila";
import { MarkAnnouncementsRead } from "@/components/admin/MarkAnnouncementsRead";

const LEVEL: Record<string, { label: string; cls: string; dot: string }> = {
  incident: { label: "Incident", cls: "border-guava/40 bg-guava/5", dot: "bg-guava" },
  warning: { label: "Heads up", cls: "border-mango/40 bg-mango/5", dot: "bg-mango" },
  info: { label: "Update", cls: "border-plum-ink/10 bg-white", dot: "bg-brand-primary" },
};

/**
 * What the Servd team has told every restaurant.
 *
 * Opening this page is what marks them read — the badge means "you haven't
 * seen this", and now they have. Done from a client effect rather than during
 * render so the unread state survives long enough to be shown: marking on the
 * server first would clear the highlight before the page painted, and the
 * owner would never see which one was new.
 */
export default async function AnnouncementsPage() {
  const user = await requireAdminPage();
  const items = await listAnnouncements(user.staffUserId);
  const unread = items.filter((a) => a.unread).length;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Announcements</h1>
        <p className="text-sm text-plum-ink/50">
          Updates from the Servd team — fixes, planned work, and anything that affects your shop.
        </p>
      </div>

      {unread > 0 && <MarkAnnouncementsRead action={markAnnouncementsRead} />}

      {items.length === 0 ? (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
          <p className="text-2xl">📭</p>
          <p className="mt-2 text-sm text-plum-ink/55">
            Nothing yet. Anything we need to tell you will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
            const l = LEVEL[a.level] ?? LEVEL.info;
            return (
              <li
                key={a.id}
                className={`rounded-tile border p-5 ${l.cls} ${
                  a.unread ? "ring-2 ring-brand-primary/30" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${l.dot}`} aria-hidden />
                  <h2 className="font-heading font-bold text-plum-ink">{a.title}</h2>
                  {a.unread && (
                    <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-primary">
                      New
                    </span>
                  )}
                  <span className="ml-auto text-xs text-plum-ink/45">
                    {a.publishedAt ? manilaDateTime(a.publishedAt) : ""}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-plum-ink/75">{a.body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
