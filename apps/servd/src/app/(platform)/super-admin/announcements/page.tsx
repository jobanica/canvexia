import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { listAllAnnouncements } from "@/server/announcements/queries";
import { unpublishAnnouncement, deleteAnnouncement } from "@/server/announcements/actions";
import { AnnouncementForm } from "@/components/super-admin/AnnouncementForm";
import { manilaDateTime } from "@/lib/time/manila";

const LEVEL: Record<string, { label: string; cls: string }> = {
  incident: { label: "Incident", cls: "bg-guava/15 text-guava" },
  warning: { label: "Heads up", cls: "bg-mango/15 text-mango" },
  info: { label: "Update", cls: "bg-plum-ink/5 text-plum-ink/55" },
};

export default async function SuperAdminAnnouncementsPage() {
  await requireSuperAdminPage();
  const items = await listAllAnnouncements();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Announcements</h1>
        <p className="text-sm text-plum-ink/50">
          Tell every restaurant something — a bug fixed, planned work, a new feature. They see a
          count on their dashboard until they read it.
        </p>
      </div>

      <AnnouncementForm />

      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <p className="mb-3 text-sm font-semibold">Sent{items.length > 0 && ` (${items.length})`}</p>
        {items.length === 0 ? (
          <p className="text-sm text-plum-ink/55">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {items.map((a) => {
              const l = LEVEL[a.level] ?? LEVEL.info;
              return (
                <li key={a.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.cls}`}>
                      {l.label}
                    </span>
                    <span className="font-medium">{a.title}</span>
                    {!a.publishedAt && (
                      <span className="rounded-full bg-plum-ink/5 px-2 py-0.5 text-xs font-semibold text-plum-ink/50">
                        Not sent
                      </span>
                    )}
                    <span className="ml-auto text-xs text-plum-ink/45">
                      {a.publishedAt ? manilaDateTime(a.publishedAt) : manilaDateTime(a.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-plum-ink/65">{a.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {/* Read count, not a delivery count: it says how many people
                        actually opened it, which is the only number worth
                        knowing after sending. */}
                    <span className="text-xs text-plum-ink/45">
                      Read by {a.readCount} {a.readCount === 1 ? "person" : "people"}
                    </span>
                    {a.publishedAt && (
                      <form action={unpublishAnnouncement}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-xs font-semibold text-plum-ink/55 hover:underline">
                          Unsend
                        </button>
                      </form>
                    )}
                    <form action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="text-xs font-semibold text-guava hover:underline">
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
