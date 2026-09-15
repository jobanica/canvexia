import { PRODUCTS } from "@servd/core";
import { requireHqPage } from "@/server/hq/auth";
import { listAnnouncements } from "@/server/hq/announcements";
import { HqShell } from "@/components/hq/HqShell";
import { AnnouncementForm } from "@/components/hq/TeamForms";

const LEVEL_TONE: Record<string, string> = {
  info: "bg-brand-ink/5 text-brand-ink/60",
  warning: "bg-brand-accent/15 text-brand-accent",
  incident: "bg-guava text-white",
};

function describe(segment: { tier?: string[]; status?: string[]; productId?: string[] } | null) {
  if (!segment) return "Every partner";
  const parts: string[] = [];
  if (segment.tier?.length) parts.push(segment.tier.join(" or "));
  if (segment.status?.length) parts.push(segment.status.join(" or "));
  if (segment.productId?.length) parts.push(`using ${segment.productId.join(" or ")}`);
  return parts.join(" · ");
}

export default async function HqAnnouncementsPage() {
  const user = await requireHqPage("announcements.write");
  const { rows, partnerCount } = await listAnnouncements();

  return (
    <HqShell
      user={user}
      title="Announcements"
      subtitle={`${partnerCount} partner${partnerCount === 1 ? "" : "s"} can receive these.`}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem] lg:items-start">
        <div className="min-w-0 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-brand-ink/50">
              Nothing posted yet.
            </p>
          ) : (
            <ul className="divide-y divide-brand-ink/[0.06]">
              {rows.map((a) => (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase ${LEVEL_TONE[a.level]}`}>
                      {a.level}
                    </span>
                    <span className="font-heading text-lg font-bold">{a.title}</span>
                    <span className="ml-auto text-xs text-brand-ink/40">
                      {a.publishedAt
                        ? `published ${a.publishedAt.toLocaleDateString("en-PH", { dateStyle: "medium" })}`
                        : a.scheduledFor
                          ? `scheduled ${a.scheduledFor.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`
                          : "draft"}
                    </span>
                  </div>

                  <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink/70">{a.body}</p>

                  <p className="mt-2 text-xs text-brand-ink/45">
                    {describe(a.segment)} — {a.audience} partner{a.audience === 1 ? "" : "s"}
                    {a.publishedAt && ` · read by ${a.reads} of ${a.audience}`}
                    {a.authorEmail && ` · ${a.authorEmail}`}
                  </p>

                  {a.readers.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-brand-ink/40">
                        Read receipts
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-brand-ink/55">
                        {a.readers.map((r) => (
                          <li key={r.partnerId}>
                            {r.partnerName} — {r.readAt.toLocaleDateString("en-PH", { dateStyle: "medium" })}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
            A published announcement stays published. Un-publishing something partners have already
            read is a retraction, and the honest form of that is a new notice saying so.
          </p>
        </div>

        <AnnouncementForm
          products={Object.values(PRODUCTS).map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </HqShell>
  );
}
