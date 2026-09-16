import "server-only";
import {
  campaignCost,
  capReached,
  countSegments,
  nextSendTime,
  renderMerge,
  withOptOut,
  withinWindow,
  worstCaseBody,
} from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getSmsProvider } from "@/server/sms";
import { partnerSender } from "./sms-send";
import { debit, refund, claimLowBalanceNotice, getWallet } from "./sms-wallet";
import { resolveAudience, type AudienceFilters } from "./sms-audience";
import { recordSmsUsage } from "./sms-usage";
import { managerSeats, queueNotification } from "./notify";

/**
 * Campaigns: composing, costing, scheduling and draining.
 *
 * SENDING HAPPENS IN A CRON, NOT IN A REQUEST. Two thousand messages at one
 * HTTP call each takes minutes, and a serverless function does not have
 * minutes — a request that times out half way through has spent half the
 * credits and left no record of which half. So a campaign is written down with
 * its recipients, and a drainer works through it in batches.
 */

/** Per tick. Small enough to finish inside a function's budget. */
const BATCH = 60;

export interface Estimate {
  recipients: number;
  /** After the frequency cap and the opt-out line are taken into account. */
  eligible: number;
  suppressed: number;
  segments: number;
  credits: number;
  balance: number;
  affordable: boolean;
}

interface Limits {
  windowStartMin: number;
  windowEndMin: number;
  capCount: number;
  capDays: number;
  optOutText: string | null;
}

/**
 * A partner's send window and frequency cap.
 *
 * Fetched per screen rather than carried on `CurrentPartner`: that object is
 * loaded on EVERY page in the portal, and four columns only two screens read
 * would be four columns fetched a hundred times a day for nothing.
 */
export async function partnerSmsLimits(partnerId: string): Promise<Limits> {
  return limitsOf(partnerId);
}

export type { Limits as SmsLimits };

async function limitsOf(partnerId: string): Promise<Limits> {
  try {
    const row = await systemDb((tx) =>
      tx.partner.findUnique({
        where: { id: partnerId },
        select: {
          smsWindowStartMin: true,
          smsWindowEndMin: true,
          smsCapCount: true,
          smsCapDays: true,
          smsOptOutText: true,
        },
      }),
    );
    return {
      windowStartMin: row?.smsWindowStartMin ?? 540,
      windowEndMin: row?.smsWindowEndMin ?? 1200,
      capCount: row?.smsCapCount ?? 2,
      capDays: row?.smsCapDays ?? 7,
      optOutText: row?.smsOptOutText ?? null,
    };
  } catch {
    return { windowStartMin: 540, windowEndMin: 1200, capCount: 2, capDays: 7, optOutText: null };
  }
}

/**
 * Who in this audience may actually be sent to right now.
 *
 * THE CAP IS APPLIED HERE, before anything is charged or queued, so the number
 * on the screen is the number of people who will get it. Counting the whole
 * audience and suppressing later would quote a cost nobody pays and send to
 * fewer people than the composer promised.
 */
async function eligible(
  partnerId: string,
  filters: AudienceFilters,
  limits: Limits,
  now: Date,
): Promise<{ all: number; keep: Awaited<ReturnType<typeof resolveAudience>> }> {
  const all = await resolveAudience(partnerId, filters);
  if (limits.capCount <= 0) return { all: all.length, keep: [] };

  const ids = all.map((a) => a.id);
  if (ids.length === 0) return { all: 0, keep: [] };

  const since = new Date(now.getTime() - limits.capDays * 86_400_000);
  let recent: { smsContactId: string | null }[] = [];
  try {
    recent = await systemDb((tx) =>
      tx.smsMessage.findMany({
        where: {
          smsContactId: { in: ids },
          sentAt: { gte: since },
          // Only marketing counts. A 1:1 reply is exempt, per the brief, and
          // those carry no campaign of this partner's.
          status: { in: ["sent", "delivered"] },
        },
        select: { smsContactId: true },
      }),
    );
  } catch {
    // Unable to count means we cannot prove the cap is respected. Send nothing
    // rather than send too much — an over-send cannot be taken back.
    return { all: all.length, keep: [] };
  }

  const counts = new Map<string, Date[]>();
  for (const m of recent) {
    if (!m.smsContactId) continue;
    const list = counts.get(m.smsContactId) ?? [];
    // The exact times are already inside the window; `capReached` only counts
    // how many fall inside it, so `now` is a safe stand-in.
    list.push(now);
    counts.set(m.smsContactId, list);
  }

  const keep = all.filter(
    (c) => !capReached(counts.get(c.id) ?? [], now, { count: limits.capCount, days: limits.capDays }),
  );
  return { all: all.length, keep };
}

export async function estimate(
  partnerId: string,
  body: string,
  filters: AudienceFilters,
  now: Date = new Date(),
): Promise<Estimate> {
  const limits = await limitsOf(partnerId);
  const [{ all, keep }, wallet] = await Promise.all([
    eligible(partnerId, filters, limits, now),
    getWallet(partnerId),
  ]);

  // The WORST case, with the opt-out line on: that is what will be charged.
  const sample = keep.slice(0, 50).map((c) => ({ name: c.name, businessName: c.businessName }));
  const worst = withOptOut(worstCaseBody(body, sample), limits.optOutText);
  const segments = countSegments(worst).segments;
  const credits = campaignCost(worst, keep.length);

  return {
    recipients: all,
    eligible: keep.length,
    suppressed: all - keep.length,
    segments,
    credits,
    balance: wallet.balance,
    affordable: wallet.balance >= credits,
  };
}

export type CreateResult =
  | { ok: true; campaignId: string; queuedUntil: Date | null; recipients: number }
  | { ok: false; message: string };

/**
 * Write a campaign down, with one message row per recipient.
 *
 * NOTHING IS SENT HERE and no credits are taken here. The rows are `queued`;
 * the drainer charges per message as the provider accepts it, which is what the
 * brief asks for and is also the only version where a crash half way through
 * has not silently spent money.
 */
export async function createCampaign(input: {
  partnerId: string;
  actorEmail: string;
  actorName: string | null;
  partnerName: string;
  name: string;
  body: string;
  filters: AudienceFilters;
  /** Null means "as soon as the window allows". */
  scheduledAt: Date | null;
  now?: Date;
}): Promise<CreateResult> {
  const now = input.now ?? new Date();
  const body = input.body.trim();
  if (body.length < 3) return { ok: false, message: "Write the message first." };
  if (body.length > 1000) return { ok: false, message: "That message is too long to send." };

  const limits = await limitsOf(input.partnerId);
  const { keep } = await eligible(input.partnerId, input.filters, limits, now);
  if (keep.length === 0) {
    return {
      ok: false,
      message:
        "Nobody in that audience can be texted right now — either nobody matches, or they have all had their limit this week.",
    };
  }

  const wallet = await getWallet(input.partnerId);
  const worst = withOptOut(worstCaseBody(body, keep.slice(0, 50)), limits.optOutText);
  const needed = campaignCost(worst, keep.length);
  if (wallet.balance < needed) {
    return {
      ok: false,
      message: `This needs ${needed.toLocaleString("en-PH")} credits and you have ${wallet.balance.toLocaleString("en-PH")}. Top up first.`,
    };
  }

  // The window applies to a "send now" too. A campaign started at 9pm queues
  // to tomorrow morning rather than going out at 9pm, which is the whole point
  // of having a window.
  const window = { startMin: limits.windowStartMin, endMin: limits.windowEndMin };
  const requested = input.scheduledAt ?? now;
  const sendAt = nextSendTime(requested < now ? now : requested, window);

  try {
    const campaignId = await systemDb(async (tx) => {
      const campaign = await tx.smsCampaign.create({
        data: {
          partnerId: input.partnerId,
          name: input.name.trim().slice(0, 120) || "Campaign",
          body,
          status: "scheduled",
          scheduledAt: sendAt,
          audience: input.filters as object,
          recipientCount: keep.length,
          segments: countSegments(worst).segments,
          createdBy: input.actorEmail,
        },
        select: { id: true },
      });

      // One row per recipient, RENDERED NOW. The merge values are what was true
      // when the campaign was composed; re-rendering at send time would use a
      // name somebody changed in between.
      await tx.smsMessage.createMany({
        data: keep.map((c) => ({
          campaignId: campaign.id,
          smsContactId: c.id,
          toPhone: c.mobile,
          status: "queued",
          body: withOptOut(
            renderMerge(body, {
              name: c.name,
              businessName: c.businessName,
              staffName: input.actorName,
              partnerName: input.partnerName,
            }),
            limits.optOutText,
          ),
          segments: 1,
        })),
      });
      return campaign.id;
    });

    return {
      ok: true,
      campaignId,
      queuedUntil: withinWindow(now, window) && !input.scheduledAt ? null : sendAt,
      recipients: keep.length,
    };
  } catch {
    return { ok: false, message: "Couldn't save that campaign." };
  }
}

export interface DrainResult {
  campaigns: number;
  sent: number;
  failed: number;
  refunded: number;
}

/**
 * Send what is due. Called by the cron.
 *
 * CLAIMS THE CAMPAIGN FIRST, by moving it to `sending` with a conditional
 * update. Two overlapping ticks would otherwise both send the same batch, and
 * the recipients would get it twice.
 */
export async function drainCampaigns(now: Date = new Date()): Promise<DrainResult> {
  const out: DrainResult = { campaigns: 0, sent: 0, failed: 0, refunded: 0 };
  const provider = getSmsProvider();
  if (!provider) return out;

  let due: { id: string; partnerId: string | null }[] = [];
  try {
    due = await systemDb((tx) =>
      tx.smsCampaign.findMany({
        where: {
          status: { in: ["scheduled", "sending"] },
          scheduledAt: { lte: now },
          partnerId: { not: null },
        },
        orderBy: { scheduledAt: "asc" },
        take: 5,
        select: { id: true, partnerId: true },
      }),
    );
  } catch {
    return out;
  }

  for (const campaign of due) {
    if (!campaign.partnerId) continue;
    const limits = await limitsOf(campaign.partnerId);
    // Outside the window now — a campaign that was due at 19:59 and is being
    // drained at 20:01 waits rather than going out late.
    if (!withinWindow(now, { startMin: limits.windowStartMin, endMin: limits.windowEndMin })) {
      continue;
    }

    try {
      const claimed = await systemDb((tx) =>
        tx.smsCampaign.updateMany({
          where: { id: campaign.id, status: { in: ["scheduled", "sending"] } },
          data: { status: "sending", startedAt: now },
        }),
      );
      if (claimed.count === 0) continue;
    } catch {
      continue;
    }

    out.campaigns += 1;
    const result = await drainOne(campaign.id, campaign.partnerId, provider, now);
    out.sent += result.sent;
    out.failed += result.failed;
    out.refunded += result.refunded;
  }

  return out;
}

async function drainOne(
  campaignId: string,
  partnerId: string,
  provider: NonNullable<ReturnType<typeof getSmsProvider>>,
  now: Date,
): Promise<{ sent: number; failed: number; refunded: number }> {
  const tally = { sent: 0, failed: 0, refunded: 0 };
  const sender = await partnerSender(partnerId);

  let queued: { id: string; toPhone: string | null; body: string | null; smsContactId: string | null }[] =
    [];
  try {
    queued = await systemDb((tx) =>
      tx.smsMessage.findMany({
        where: { campaignId, status: "queued" },
        take: BATCH,
        select: { id: true, toPhone: true, body: true, smsContactId: true },
      }),
    );
  } catch {
    return tally;
  }

  for (const message of queued) {
    if (!message.toPhone || !message.body) continue;
    const segments = countSegments(message.body).segments;

    // PAY FIRST, REFUND ON REJECTION. The other order — send, then debit —
    // sends texts a partner cannot pay for whenever the balance runs out mid
    // campaign, and there is no way to un-send one.
    const paid = await debit(partnerId, segments, "sms_campaign");
    if (!paid.ok) {
      // Out of credits. Leave the rest queued and stop: the campaign resumes
      // by itself after a top-up, which is kinder than failing everybody.
      await systemDb((tx) =>
        tx.smsCampaign.updateMany({
          where: { id: campaignId },
          data: { status: "scheduled" },
        }),
      ).catch(() => undefined);
      break;
    }

    const result = await provider.send(sender.senderName, message.toPhone, message.body);

    try {
      await systemDb(async (tx) => {
        await tx.smsMessage.update({
          where: { id: message.id },
          data: {
            status: result.ok ? "sent" : "failed",
            providerRef: result.providerRef ?? null,
            error: result.ok ? null : (result.error ?? "send failed").slice(0, 300),
            sentAt: result.ok ? now : null,
            segments,
            attempts: { increment: 1 },
          },
          select: { id: true },
        });
        if (result.ok && message.smsContactId) {
          await tx.smsContact.update({
            where: { id: message.smsContactId },
            data: { lastSentAt: now },
            select: { id: true },
          });
        }
      });
    } catch {
      /* the message went out; the bookkeeping is retried on the next tick */
    }

    if (result.ok) {
      tally.sent += 1;
      // The pass-through rollup HQ's statement reads. Only successful sends:
      // the aggregator does not bill us for a message it refused, and a refund
      // has already given the partner their credit back.
      await recordSmsUsage(partnerId, segments, now);
    } else {
      tally.failed += 1;
      // The brief's rule: a message the network refused is refunded. A partner
      // should not pay for a text that never arrived.
      await refund(partnerId, segments, "sms_refund");
      tally.refunded += segments;
    }
  }

  // Finished, or more to do next tick.
  try {
    const left = await systemDb((tx) =>
      tx.smsMessage.count({ where: { campaignId, status: "queued" } }),
    );
    const totals = await systemDb((tx) =>
      tx.smsMessage.groupBy({
        by: ["status"],
        where: { campaignId },
        _count: { _all: true },
        _sum: { segments: true },
      }),
    );
    const sent = totals.find((t) => t.status === "sent")?._count._all ?? 0;
    const failed = totals.find((t) => t.status === "failed")?._count._all ?? 0;
    const spent = totals.find((t) => t.status === "sent")?._sum.segments ?? 0;

    await systemDb((tx) =>
      tx.smsCampaign.updateMany({
        where: { id: campaignId },
        data: {
          status: left > 0 ? "sending" : "sent",
          sentAt: left > 0 ? null : now,
          sentCount: sent,
          failedCount: failed,
          creditsSpent: spent,
        },
      }),
    );
  } catch {
    /* the counts catch up on the next tick */
  }

  // The low-balance warning, once per drain rather than once per message.
  if (await claimLowBalanceNotice(partnerId)) {
    const wallet = await getWallet(partnerId);
    await queueNotification({
      partnerId,
      event: "sms.low_balance",
      to: await managerSeats(partnerId),
      subject: "SMS credits running low",
      body:
        `You have ${wallet.balance.toLocaleString("en-PH")} SMS credits left.\n` +
        `A campaign that runs out part-way through sends to some of your list and not the rest.`,
    });
  }

  return tally;
}

export async function listCampaigns(partnerId: string) {
  try {
    return await systemDb((tx) =>
      tx.smsCampaign.findMany({
        where: { partnerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          body: true,
          status: true,
          scheduledAt: true,
          sentAt: true,
          recipientCount: true,
          sentCount: true,
          failedCount: true,
          creditsSpent: true,
          createdAt: true,
        },
      }),
    );
  } catch {
    return [];
  }
}
