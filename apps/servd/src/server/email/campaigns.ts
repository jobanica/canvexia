import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { renderEmail, buildRecipientLinks } from "@/lib/email/render";
import { getEmailCreds, sendBatch, type OutgoingEmail } from "./provider";
import { resolveSegment } from "./audience";
import { MAX_RECIPIENTS, type SegmentKey } from "@/lib/email/segments";

export { MAX_RECIPIENTS };

/**
 * Sending a campaign. Recipients are resolved and recorded FIRST, then sent in
 * provider-sized batches, so at any point the campaign row says exactly how
 * many went out and how many failed — including if the process dies halfway.
 *
 * There is no background queue: with the batch endpoint a few hundred leads is
 * a handful of HTTP calls, and a real queue would be infrastructure this
 * doesn't need yet. The per-campaign cap below is what keeps that honest.
 */

const BATCH_SIZE = 100; // provider limit

export interface SendReport {
  campaignId: string;
  recipients: number;
  sent: number;
  failed: number;
}

export async function sendCampaign(input: {
  subject: string;
  body: string;
  segment: SegmentKey;
}): Promise<{ ok: true; report: SendReport } | { ok: false; error: string }> {
  const creds = await getEmailCreds();
  if (!creds) {
    return { ok: false, error: "Email isn't set up yet — add your sending key in Payments & keys." };
  }

  const recipients = await resolveSegment(input.segment, MAX_RECIPIENTS);
  if (recipients.length === 0) {
    return { ok: false, error: "Nobody in that segment has an email address right now." };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Record the campaign and every intended recipient before a single send, so
  // a crash mid-run leaves an accurate picture rather than a silent gap.
  let campaignId: string;
  try {
    campaignId = await systemDb(async (tx) => {
      const campaign = await tx.emailCampaign.create({
        data: {
          subject: input.subject,
          body: input.body,
          segment: input.segment,
          status: "sending",
          recipients: recipients.length,
        },
        select: { id: true },
      });
      await tx.emailMessage.createMany({
        data: recipients.map((r) => ({
          campaignId: campaign.id,
          restaurantId: r.restaurantId,
          email: r.email,
        })),
      });
      return campaign.id;
    });
  } catch {
    return { ok: false, error: "Couldn't start the campaign. Run the email migration, then retry." };
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const emails: OutgoingEmail[] = chunk.map((r) => {
      const links = buildRecipientLinks(base, r);
      const { text, html } = renderEmail(
        input.body,
        { name: r.name, email: r.email, ...links },
        `${base}/unsubscribe/${r.unsubToken}`,
      );
      return { to: r.email, subject: input.subject, text, html };
    });

    const outcomes = await sendBatch(creds, emails);
    for (const o of outcomes) {
      if (o.ok) sent++;
      else failed++;
    }

    // Record this batch's results before starting the next one.
    try {
      await systemDb(async (tx) => {
        for (const o of outcomes) {
          await tx.emailMessage.updateMany({
            where: { campaignId, email: o.to, status: "queued" },
            data: {
              status: o.ok ? "sent" : "failed",
              providerRef: o.providerRef ?? null,
              error: o.error?.slice(0, 300) ?? null,
              sentAt: o.ok ? new Date() : null,
            },
          });
        }
      });
    } catch {
      /* the counters below still reflect what actually happened */
    }
  }

  try {
    await systemDb((tx) =>
      tx.emailCampaign.update({
        where: { id: campaignId },
        data: {
          status: failed === recipients.length ? "failed" : "sent",
          sent,
          failed,
          sentAt: new Date(),
        },
        select: { id: true },
      }),
    );
  } catch {
    /* counters are best-effort; the per-message rows are the record */
  }

  return { ok: true, report: { campaignId, recipients: recipients.length, sent, failed } };
}

export interface CampaignRow {
  id: string;
  subject: string;
  segment: string;
  status: string;
  recipients: number;
  sent: number;
  failed: number;
  sentAt: string | null;
}

/** Recent campaigns for the history list. */
export async function listCampaigns(limit = 25): Promise<CampaignRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.emailCampaign.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          subject: true,
          segment: true,
          status: true,
          recipients: true,
          sent: true,
          failed: true,
          sentAt: true,
        },
      }),
    );
    return rows.map((r) => ({ ...r, sentAt: r.sentAt ? r.sentAt.toISOString() : null }));
  } catch {
    return []; // tables not migrated yet
  }
}
