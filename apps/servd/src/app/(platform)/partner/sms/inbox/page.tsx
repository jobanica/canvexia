import { notFound } from "next/navigation";
import { getCurrentPartner, partnerAllows } from "@/server/partners/auth";
import { listThreads, readThread, markThreadRead } from "@/server/partners/sms-inbox";
import { PortalShell } from "@/components/partner/PortalShell";
import { Inbox } from "@/components/partner/Inbox";

export const metadata = { title: "SMS inbox · CANVEXIA" };
export const dynamic = "force-dynamic";

/**
 * Replies, threaded.
 *
 * TWO PERMISSIONS REACH THIS SCREEN and they see different things.
 * `sms.send` — whoever runs the campaigns — sees every conversation.
 * `sms.reply_own` sees the threads assigned to them, plus the UNASSIGNED ones:
 * a message from a number nobody owns is exactly the one that would otherwise
 * sit unanswered for a week.
 */
export default async function SmsInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const partner = await getCurrentPartner();
  if (!partner || partner.status !== "approved") notFound();

  const seesAll = partnerAllows(partner, "sms.send");
  const repliesOwn = partnerAllows(partner, "sms.reply_own");
  if (!seesAll && !repliesOwn) notFound();

  const q = await searchParams;
  const threads = await listThreads(partner.id, {
    assignedToId: seesAll ? null : partner.user.id,
  });

  const open = q.phone && threads.some((t) => t.phone === q.phone) ? q.phone : null;
  const messages = open ? await readThread(partner.id, open) : [];
  // Opening a thread marks it read. Doing it here rather than behind a button
  // is the behaviour everybody already expects from an inbox.
  if (open) await markThreadRead(partner.id, open);

  return (
    <PortalShell
      partner={partner}
      title="SMS inbox"
      subtitle={
        seesAll
          ? "Everything people have texted back."
          : "The conversations assigned to you, and the ones nobody owns yet."
      }
    >
      <Inbox threads={threads} openPhone={open} messages={messages} />
    </PortalShell>
  );
}
