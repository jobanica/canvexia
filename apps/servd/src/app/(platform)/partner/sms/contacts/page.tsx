import { requirePartnerPageWith } from "@/server/partners/auth";
import { countByConsent, listContacts } from "@/server/partners/sms-contacts";
import { partnerSender } from "@/server/partners/sms-send";
import { PortalShell } from "@/components/partner/PortalShell";
import { ContactBook } from "@/components/partner/ContactBook";

export const metadata = { title: "SMS contacts · CANVEXIA" };
export const dynamic = "force-dynamic";

/**
 * The contact book.
 *
 * `sms.send` — the campaign key. Reading the book and sending to it are the
 * same permission on purpose: the list IS the audience, and somebody who can
 * read every number a partner has collected is somebody the partner has already
 * decided to trust with it.
 */
export default async function SmsContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const partner = await requirePartnerPageWith("sms.send");
  const q = await searchParams;
  const status =
    q.status === "opted_in" || q.status === "opted_out" || q.status === "unknown"
      ? q.status
      : "all";

  const [contacts, counts, sender] = await Promise.all([
    listContacts(partner.id, { search: q.q, status }),
    countByConsent(partner.id),
    partnerSender(partner.id),
  ]);

  return (
    <PortalShell
      partner={partner}
      title="SMS contacts"
      subtitle="Business owners your team has collected, and what each of them agreed to."
    >
      <ContactBook
        contacts={contacts}
        counts={counts}
        search={q.q ?? ""}
        status={status}
        senderName={sender.senderName}
        senderIsOwn={sender.own}
      />
    </PortalShell>
  );
}
