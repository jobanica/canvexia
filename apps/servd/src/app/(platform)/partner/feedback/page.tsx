import Link from "next/link";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { listPartnerFeedback } from "@/server/partners/feedback";
import { PortalShell } from "@/components/partner/PortalShell";
import { FeedbackReply } from "@/components/partner/FeedbackReply";
import { manilaDateTime } from "@/lib/time/manila";

export const metadata = { title: "Messages" };

/**
 * WHAT THE MERCHANTS HAVE WRITTEN, to the partner who sold them the software.
 *
 * REPORTED — "yes build the feedback inbox to partners." The "Send feedback"
 * button in a merchant's dashboard wrote to a table only Servd's super-admin
 * could read. A shop in Tagum reached a company they have never dealt with;
 * their partner never knew.
 *
 * `support.tickets` is the gate. That permission has been in the A7 grid since
 * it was written, carrying a comment saying it had no screen anywhere in this
 * repository — this is the screen. Admin, ops manager and support hold it by
 * default; sales does not, which is right: answering for a shop that already
 * exists is support's job.
 *
 * UNANSWERED FIRST. A partner opens this looking for the thing nobody has dealt
 * with, which is the opposite of what a merchant opens their own list for.
 */
export default async function PartnerFeedbackPage() {
  const partner = await requirePartnerPageWith("support.tickets");
  const rows = await listPartnerFeedback(partner.id);
  const open = rows.filter((r) => !r.reply).length;

  return (
    <PortalShell
      partner={partner}
      title="Messages"
      subtitle={
        rows.length === 0
          ? "Nothing from your merchants yet."
          : open === 0
            ? `${rows.length} message${rows.length === 1 ? "" : "s"} — all answered.`
            : `${open} waiting on you, of ${rows.length}.`
      }
    >
      {rows.length === 0 ? (
        <div className="rounded-tile border border-dashed border-brand-ink/15 bg-white p-10 text-center">
          <p className="font-heading text-lg font-bold">No messages</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-brand-ink/55">
            Your merchants reach you from the <strong>Send feedback</strong> button in their own
            dashboard. Anything they write lands here, and your reply appears in the same place
            they wrote it.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const who = r.restaurantName || "A merchant";
            return (
              <li
                key={r.id}
                className={`rounded-tile border bg-white p-5 ${
                  r.reply ? "border-brand-ink/10" : "border-mango/40 bg-mango/[0.04]"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="font-heading font-bold">
                      {r.restaurantId ? (
                        <Link
                          href={`/partner/merchants/${r.restaurantId}`}
                          className="underline decoration-brand-ink/20 hover:decoration-brand-ink"
                        >
                          {who}
                        </Link>
                      ) : (
                        who
                      )}
                    </p>
                    {r.authorEmail && (
                      <p className="truncate text-xs text-brand-ink/45">{r.authorEmail}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-brand-ink/45">
                    {/* A rating is optional on the way in, so it is optional
                        here too — "0 stars" would be a score nobody gave. */}
                    {r.rating !== null && (
                      <span className="font-semibold text-brand-ink/60">
                        {"★".repeat(r.rating)}
                        <span className="text-brand-ink/20">{"★".repeat(5 - r.rating)}</span>
                      </span>
                    )}
                    <span>{manilaDateTime(new Date(r.createdAt))}</span>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm text-brand-ink/80">{r.message}</p>

                {r.reply && (
                  <div className="mt-3 rounded-lg border border-brand-ink/10 bg-brand-surface p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
                      {/*
                        WHO ANSWERED. Servd can reply to these too, from its own
                        console, and without saying so a partner would read
                        somebody else's words as their own team's.
                      */}
                      {r.repliedByUs ? "Your reply" : "Answered by Servd"}
                      {r.repliedAt && ` · ${manilaDateTime(new Date(r.repliedAt))}`}
                      {r.replyReadAt ? " · read" : " · not opened yet"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink/75">{r.reply}</p>
                  </div>
                )}

                <FeedbackReply id={r.id} answered={!!r.reply} merchant={who} />
              </li>
            );
          })}
        </ul>
      )}
    </PortalShell>
  );
}
