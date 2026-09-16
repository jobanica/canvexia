import { getCurrentPartner } from "@/server/partners/auth";
import { toCsv } from "@/lib/hq/csv";
import { listContacts } from "@/server/partners/sms-contacts";

/**
 * The contact book, as CSV.
 *
 * CONSENT COLUMNS ARE NOT OPTIONAL HERE, per the brief, and the EVIDENCE column
 * is the one that matters: a list of numbers with no record of what each person
 * agreed to is exactly the file that gets imported somewhere else and texted
 * without consent. Exporting the evidence with it means the next system has no
 * excuse.
 *
 * `sms.send` only — this is every number the partner holds.
 */
export async function GET() {
  const partner = await getCurrentPartner();
  if (!partner || partner.status !== "approved" || !partner.permissions.has("sms.send")) {
    return new Response("Not found", { status: 404 });
  }

  const contacts = await listContacts(partner.id, { status: "all" });

  const rows = contacts.map((c) => ({
    mobile: c.mobile,
    name: c.name ?? "",
    business: c.businessName ?? "",
    source: c.source,
    consent: c.consentStatus,
    consent_at: c.consentAt ? c.consentAt.toISOString() : "",
    consent_source: c.consentSource ?? "",
    // The sentence somebody would be shown if they complained.
    consent_evidence: c.consentEvidence ?? "",
    tags: c.tags.join("; "),
    last_texted: c.lastSentAt ? c.lastSentAt.toISOString() : "",
  }));

  return new Response(
    toCsv(
      [
        "mobile",
        "name",
        "business",
        "source",
        "consent",
        "consent_at",
        "consent_source",
        "consent_evidence",
        "tags",
        "last_texted",
      ],
      rows,
    ),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sms-contacts.csv"',
      },
    },
  );
}
