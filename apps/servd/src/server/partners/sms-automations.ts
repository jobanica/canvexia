import "server-only";
import { canReceiveMarketing, capReached, renderMerge, withOptOut, withinWindow } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getSmsProvider } from "@/server/sms";
import { partnerSender } from "./sms-send";
import { partnerSmsLimits } from "./sms-campaigns";
import { debit } from "./sms-wallet";
import { recordSmsUsage } from "./sms-usage";
import { countSegments } from "@servd/core";

/**
 * Three automations, and the rules every one of them obeys.
 *
 * NO BUILDER, per the brief — three named jobs with a toggle each, because a
 * builder is a product of its own and these three are what partners actually
 * asked for.
 *
 * EVERY ONE RESPECTS CONSENT AND THE CAP. That is not a per-automation choice:
 * `sendAutomated` below is the only way any of them sends, and it re-checks
 * opt-in, the frequency cap, the send window and the balance for each
 * recipient. An automation that skipped one of those would be the exact thing
 * that gets a sender name blocked by the network.
 *
 * ALL THREE ARE OFF BY DEFAULT and stay off until a partner writes the message
 * themselves — there is no house copy that goes out under their name.
 */

export type AutomationKind = "welcome" | "visit_follow_up" | "trial_ending";

export interface AutomationResult {
  welcome: number;
  visitFollowUp: number;
  trialEnding: number;
  skipped: number;
}

/**
 * Send one automated message, or decline for a reason.
 *
 * `subjectId` makes it fire ONCE: the unique key on `sms_automation_log` is
 * what stops a daily job re-sending the same follow-up every day for as long as
 * the condition holds, which for "visited a week ago and never converted" is
 * forever.
 */
async function sendAutomated(input: {
  partnerId: string;
  kind: AutomationKind;
  subjectId: string;
  contactId: string;
  mobile: string;
  template: string;
  values: { name?: string | null; businessName?: string | null; partnerName?: string | null };
  now: Date;
}): Promise<boolean> {
  const limits = await partnerSmsLimits(input.partnerId);
  if (!withinWindow(input.now, { startMin: limits.windowStartMin, endMin: limits.windowEndMin })) {
    // Not sent, and NOT logged — so it is picked up on the next run inside the
    // window rather than skipped for good.
    return false;
  }

  let contact: {
    id: string;
    consentStatus: string;
    lastSentAt: Date | null;
  } | null = null;
  try {
    contact = await systemDb((tx) =>
      tx.smsContact.findFirst({
        where: { id: input.contactId, partnerId: input.partnerId },
        select: { id: true, consentStatus: true, lastSentAt: true },
      }),
    );
  } catch {
    return false;
  }
  if (!contact || !canReceiveMarketing(contact.consentStatus)) return false;

  // The cap, from the messages actually sent to this person.
  try {
    const since = new Date(input.now.getTime() - limits.capDays * 86_400_000);
    const recent = await systemDb((tx) =>
      tx.smsMessage.count({
        where: { smsContactId: contact!.id, sentAt: { gte: since }, status: "sent" },
      }),
    );
    if (capReached(Array(recent).fill(input.now), input.now, {
      count: limits.capCount,
      days: limits.capDays,
    })) {
      return false;
    }
  } catch {
    // Cannot prove the cap is respected → do not send. An over-send cannot be
    // taken back.
    return false;
  }

  const body = withOptOut(renderMerge(input.template, input.values), limits.optOutText);
  const segments = countSegments(body).segments;

  // CLAIM FIRST. The log row is what makes this once-only, and writing it after
  // the send would let a crash between the two produce a second text tomorrow.
  try {
    await systemDb((tx) =>
      tx.smsAutomationLog.create({
        data: {
          partnerId: input.partnerId,
          kind: input.kind,
          subjectId: input.subjectId,
          smsContactId: input.contactId,
        },
        select: { id: true },
      }),
    );
  } catch {
    // Unique violation: already fired for this subject. Not an error.
    return false;
  }

  const paid = await debit(input.partnerId, segments, `sms_${input.kind}`);
  if (!paid.ok) return false;

  const provider = getSmsProvider();
  if (!provider) return false;
  const sender = await partnerSender(input.partnerId);
  const result = await provider.send(sender.senderName, input.mobile, body);
  if (!result.ok) return false;

  await recordSmsUsage(input.partnerId, segments, input.now);

  try {
    await systemDb(async (tx) => {
      await tx.smsContact.update({
        where: { id: input.contactId },
        data: { lastSentAt: input.now },
        select: { id: true },
      });
      await tx.smsThreadMessage.create({
        data: {
          partnerId: input.partnerId,
          smsContactId: input.contactId,
          phone: input.mobile,
          direction: "out",
          body,
          providerRef: result.providerRef ?? null,
          segments,
        },
        select: { id: true },
      });
    });
  } catch {
    /* it went out; the thread catches up */
  }
  return true;
}

/**
 * Run every partner's automations. Called by the daily cron.
 *
 * A partner with all three switched off costs one indexed query, which is the
 * normal case and has to stay cheap.
 */
export async function runAutomations(now: Date = new Date()): Promise<AutomationResult> {
  const out: AutomationResult = { welcome: 0, visitFollowUp: 0, trialEnding: 0, skipped: 0 };

  let partners: {
    id: string;
    name: string;
    smsAutoWelcome: boolean;
    smsAutoWelcomeText: string | null;
    smsAutoVisitDays: number;
    smsAutoVisitText: string | null;
    smsAutoTrialDays: number;
    smsAutoTrialText: string | null;
  }[] = [];
  try {
    partners = await systemDb((tx) =>
      tx.partner.findMany({
        where: {
          status: "approved",
          OR: [
            { smsAutoWelcome: true },
            { smsAutoVisitDays: { gt: 0 } },
            { smsAutoTrialDays: { gt: 0 } },
          ],
        },
        select: {
          id: true,
          name: true,
          smsAutoWelcome: true,
          smsAutoWelcomeText: true,
          smsAutoVisitDays: true,
          smsAutoVisitText: true,
          smsAutoTrialDays: true,
          smsAutoTrialText: true,
        },
      }),
    );
  } catch {
    return out;
  }

  for (const partner of partners) {
    // 1. WELCOME — somebody who opted in on the enquiry form today.
    if (partner.smsAutoWelcome && partner.smsAutoWelcomeText?.trim()) {
      const fresh = await recentOptIns(partner.id, now);
      for (const contact of fresh) {
        const sent = await sendAutomated({
          partnerId: partner.id,
          kind: "welcome",
          subjectId: contact.id,
          contactId: contact.id,
          mobile: contact.mobile,
          template: partner.smsAutoWelcomeText,
          values: {
            name: contact.name,
            businessName: contact.businessName,
            partnerName: partner.name,
          },
          now,
        });
        sent ? (out.welcome += 1) : (out.skipped += 1);
      }
    }

    // 2. VISIT FOLLOW-UP — visited N days ago, still not signed.
    if (partner.smsAutoVisitDays > 0 && partner.smsAutoVisitText?.trim()) {
      const due = await staleVisits(partner.id, partner.smsAutoVisitDays, now);
      for (const item of due) {
        const sent = await sendAutomated({
          partnerId: partner.id,
          kind: "visit_follow_up",
          // The VISIT, not the contact: a second visit later deserves its own
          // follow-up, and keying on the contact would suppress it.
          subjectId: item.visitId,
          contactId: item.contactId,
          mobile: item.mobile,
          template: partner.smsAutoVisitText,
          values: {
            name: item.name,
            businessName: item.businessName,
            partnerName: partner.name,
          },
          now,
        });
        sent ? (out.visitFollowUp += 1) : (out.skipped += 1);
      }
    }

    // 3. TRIAL ENDING — a merchant owner whose trial runs out soon.
    if (partner.smsAutoTrialDays > 0 && partner.smsAutoTrialText?.trim()) {
      const due = await trialsEnding(partner.id, partner.smsAutoTrialDays, now);
      for (const item of due) {
        const sent = await sendAutomated({
          partnerId: partner.id,
          kind: "trial_ending",
          subjectId: item.merchantId,
          contactId: item.contactId,
          mobile: item.mobile,
          template: partner.smsAutoTrialText,
          values: {
            name: item.name,
            businessName: item.businessName,
            partnerName: partner.name,
          },
          now,
        });
        sent ? (out.trialEnding += 1) : (out.skipped += 1);
      }
    }
  }

  return out;
}

/** Opted in within the last day, from the enquiry form. */
async function recentOptIns(partnerId: string, now: Date) {
  try {
    return await systemDb((tx) =>
      tx.smsContact.findMany({
        where: {
          partnerId,
          consentStatus: "opted_in",
          source: "lead_form",
          consentAt: { gte: new Date(now.getTime() - 86_400_000) },
          // Never texted yet. A welcome to somebody we have already spoken to
          // reads as a system that has lost track.
          lastSentAt: null,
        },
        select: { id: true, mobile: true, name: true, businessName: true },
        take: 200,
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Visits from exactly N days ago whose prospect has not converted.
 *
 * A ONE-DAY WINDOW, not "N or more days ago": the wider version fires for every
 * visit in history the first time a partner switches this on, which would be a
 * partner's whole contact book texted in one afternoon.
 */
async function staleVisits(partnerId: string, days: number, now: Date) {
  const to = new Date(now.getTime() - days * 86_400_000);
  const from = new Date(to.getTime() - 86_400_000);
  try {
    const visits = await systemDb((tx) =>
      tx.staffVisit.findMany({
        where: {
          partnerId,
          occurredAt: { gte: from, lt: to },
          subjectType: "prospect",
          outcome: { notIn: ["signed"] },
        },
        select: { id: true, subjectId: true },
        take: 200,
      }),
    );
    if (visits.length === 0) return [];

    const prospectIds = visits.map((v) => v.subjectId);
    const [prospects, contacts] = await systemDb(async (tx) => [
      await tx.prospect.findMany({
        where: { id: { in: prospectIds }, partnerId, stage: { notIn: ["paid", "lost"] } },
        select: { id: true },
      }),
      await tx.smsContact.findMany({
        where: { partnerId, prospectId: { in: prospectIds }, consentStatus: "opted_in" },
        select: { id: true, mobile: true, name: true, businessName: true, prospectId: true },
      }),
    ]);

    const live = new Set(prospects.map((p) => p.id));
    const byProspect = new Map(contacts.map((c) => [c.prospectId as string, c]));

    return visits
      .filter((v) => live.has(v.subjectId) && byProspect.has(v.subjectId))
      .map((v) => {
        const c = byProspect.get(v.subjectId)!;
        return {
          visitId: v.id,
          contactId: c.id,
          mobile: c.mobile,
          name: c.name,
          businessName: c.businessName,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Merchant owners whose trial ends in N days.
 *
 * RESTAURANTS ONLY, and that is a limitation worth stating rather than hiding:
 * `subscriptions` with a `trialEndsAt` exist on the restaurant axis. The
 * pharmacy axis has no subscription table yet, so there is no trial date to
 * read — when it gains one, this query gains a second half.
 */
async function trialsEnding(partnerId: string, days: number, now: Date) {
  const from = new Date(now.getTime() + (days - 1) * 86_400_000);
  const to = new Date(now.getTime() + days * 86_400_000);
  try {
    const subs = await systemDb((tx) =>
      tx.subscription.findMany({
        where: {
          status: "trialing",
          trialEndsAt: { gte: from, lt: to },
          restaurant: { partnerId },
        },
        select: { restaurantId: true },
        take: 200,
      }),
    );
    if (subs.length === 0) return [];

    const merchantIds = subs.map((s) => s.restaurantId);
    const contacts = await systemDb((tx) =>
      tx.smsContact.findMany({
        where: { partnerId, merchantId: { in: merchantIds }, consentStatus: "opted_in" },
        select: { id: true, mobile: true, name: true, businessName: true, merchantId: true },
      }),
    );
    return contacts.map((c) => ({
      merchantId: c.merchantId as string,
      contactId: c.id,
      mobile: c.mobile,
      name: c.name,
      businessName: c.businessName,
    }));
  } catch {
    return [];
  }
}
