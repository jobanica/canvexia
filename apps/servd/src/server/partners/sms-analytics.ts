import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * What a campaign actually did.
 *
 * FIVE OF THE SIX NUMBERS ARE COUNTED FROM ROWS WE WROTE. The sixth —
 * `delivered` — comes from a delivery receipt the aggregator has never been
 * wired to send us, so it is reported as `null` rather than as zero or as a
 * copy of `sent`. Zero would read as "nothing arrived"; copying `sent` would be
 * a claim we cannot support. See docs/canvexia/sms-provider.md §2.
 */

export interface CampaignStats {
  recipients: number;
  sent: number;
  failed: number;
  /** Null until delivery receipts are wired. Not zero, and not a copy of sent. */
  delivered: number | null;
  optOuts: number;
  replies: number;
  credits: number;
  /** Contacts whose prospect advanced to trial or paid within 14 days. */
  conversions: number;
}

/** The brief's window for attributing a conversion to a campaign. */
const ATTRIBUTION_DAYS = 14;

export async function campaignStats(
  partnerId: string,
  campaignId: string,
): Promise<CampaignStats | null> {
  try {
    const campaign = await systemDb((tx) =>
      tx.smsCampaign.findFirst({
        where: { id: campaignId, partnerId },
        select: {
          recipientCount: true,
          sentCount: true,
          failedCount: true,
          creditsSpent: true,
          startedAt: true,
          sentAt: true,
          createdAt: true,
        },
      }),
    );
    if (!campaign) return null;

    const from = campaign.startedAt ?? campaign.sentAt ?? campaign.createdAt;
    const to = new Date(from.getTime() + ATTRIBUTION_DAYS * 86_400_000);

    const recipients = await systemDb((tx) =>
      tx.smsMessage.findMany({
        where: { campaignId, smsContactId: { not: null } },
        select: { smsContactId: true },
      }),
    );
    const contactIds = recipients
      .map((r) => r.smsContactId)
      .filter((id): id is string => !!id);

    if (contactIds.length === 0) {
      return {
        recipients: campaign.recipientCount,
        sent: campaign.sentCount,
        failed: campaign.failedCount,
        delivered: null,
        optOuts: 0,
        replies: 0,
        credits: campaign.creditsSpent,
        conversions: 0,
      };
    }

    const [optOuts, replies, contacts] = await systemDb(async (tx) => [
      // Opted out AFTER this campaign went out. Before it is somebody else's
      // campaign, or their own decision, and counting it here would make every
      // campaign look worse than it was.
      await tx.smsContact.count({
        where: { id: { in: contactIds }, consentStatus: "opted_out", optedOutAt: { gte: from } },
      }),
      await tx.smsThreadMessage.count({
        where: { smsContactId: { in: contactIds }, direction: "in", createdAt: { gte: from, lt: to } },
      }),
      await tx.smsContact.findMany({
        where: { id: { in: contactIds }, prospectId: { not: null } },
        select: { prospectId: true },
      }),
    ]);

    // CONVERSIONS, from the audit log rather than from the prospect's current
    // stage. A prospect that is `paid` today might have been paid before this
    // campaign ever went out; the audit row is the only record of WHEN it
    // moved. Both paths that change a stage write one.
    const prospectIds = contacts
      .map((c) => c.prospectId)
      .filter((id): id is string => !!id);

    let conversions = 0;
    if (prospectIds.length > 0) {
      const moves = await systemDb((tx) =>
        tx.auditLog.findMany({
          where: {
            partnerId,
            action: "prospect.stage",
            entityId: { in: prospectIds },
            createdAt: { gte: from, lt: to },
          },
          select: { entityId: true, after: true },
        }),
      );
      const advanced = new Set<string>();
      for (const move of moves) {
        const after = (move.after ?? {}) as { stage?: string };
        if ((after.stage === "trial" || after.stage === "paid") && move.entityId) {
          advanced.add(move.entityId);
        }
      }
      conversions = advanced.size;
    }

    return {
      recipients: campaign.recipientCount,
      sent: campaign.sentCount,
      failed: campaign.failedCount,
      delivered: null,
      optOuts,
      replies,
      credits: campaign.creditsSpent,
      conversions,
    };
  } catch {
    return null;
  }
}
