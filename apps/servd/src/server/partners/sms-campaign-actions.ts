"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { createCampaign, estimate } from "./sms-campaigns";
import type { AudienceFilters } from "./sms-audience";
import { sendMarketing } from "./sms-send";

export type CampaignState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string }
  | {
      status: "estimated";
      recipients: number;
      eligible: number;
      suppressed: number;
      segments: number;
      credits: number;
      balance: number;
      affordable: boolean;
    };

async function sender() {
  return requireWritablePartner("sms.send");
}

/** The filters off the composer's form. Unknown keys are simply not read. */
function filtersFrom(formData: FormData): AudienceFilters {
  const list = (key: string) =>
    formData
      .getAll(key)
      .map((v) => String(v))
      .filter(Boolean);
  const quiet = Number(formData.get("quietDays") ?? 0);
  return {
    tags: list("tags"),
    sources: list("sources"),
    stages: list("stages"),
    assignedToId: String(formData.get("assignedToId") ?? "") || undefined,
    productId: String(formData.get("productId") ?? "") || undefined,
    quietDays: Number.isFinite(quiet) && quiet > 0 ? quiet : undefined,
  };
}

/**
 * "How many, and what will it cost?"
 *
 * Runs the same eligibility the send does — audience, then the frequency cap —
 * so the number on the screen is the number of people who will actually get it.
 * A count that ignores the cap quotes a cost nobody pays.
 */
export async function estimateAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const who = await sender();
  if (!who) return { status: "error", message: "You can't send SMS campaigns." };

  const result = await estimate(
    who.partnerId,
    String(formData.get("body") ?? ""),
    filtersFrom(formData),
  );
  return { status: "estimated", ...result };
}

/**
 * A test send to yourself.
 *
 * TO THE SEAT'S OWN MOBILE, never to a number typed into the form. A "test
 * send" that accepts an arbitrary number is a way to send an unconsented text
 * to anybody, which is exactly what the rest of this module exists to prevent.
 * It is charged for, because the network charges us for it.
 */
export async function testSendAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const who = await sender();
  if (!who) return { status: "error", message: "You can't send SMS campaigns." };

  const seat = await systemDb((tx) =>
    tx.partnerUser.findUnique({
      where: { id: who.userId ?? "" },
      select: { mobile: true, name: true },
    }),
  ).catch(() => null);

  if (!seat?.mobile) {
    return {
      status: "error",
      message: "Add your own mobile number to your staff record first — a test goes to you.",
    };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { status: "error", message: "Write the message first." };

  const result = await sendMarketing(who.partnerId, seat.mobile, body);
  if (!result.ok) {
    return { status: "error", message: result.error ?? "That didn't send." };
  }
  return { status: "done", message: `Sent to ${seat.mobile}.` };
}

export async function createCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const who = await sender();
  if (!who) return { status: "error", message: "You can't send SMS campaigns." };

  const when = String(formData.get("scheduledAt") ?? "").trim();
  // A local Manila time from the form. Parsed with the offset spelled out,
  // because `new Date("2026-09-15T09:00")` is the SERVER's timezone, which is
  // UTC — eight hours out, silently.
  const scheduledAt = when ? new Date(`${when}:00+08:00`) : null;
  if (when && Number.isNaN(scheduledAt?.getTime())) {
    return { status: "error", message: "That date doesn't look right." };
  }

  const result = await createCampaign({
    partnerId: who.partnerId,
    actorEmail: who.email,
    actorName: who.partner.user.name,
    partnerName: who.partner.name,
    name: String(formData.get("name") ?? ""),
    body: String(formData.get("body") ?? ""),
    filters: filtersFrom(formData),
    scheduledAt,
  });
  if (!result.ok) return { status: "error", message: result.message };

  await systemDb((tx) =>
    writeSeatAudit(tx, who, {
      action: "sms.campaign_scheduled",
      entityType: "sms_campaign",
      entityId: result.campaignId,
      after: { recipients: result.recipients, scheduledAt: result.queuedUntil },
    }),
  );

  revalidatePath("/partner/sms");
  const when_ = result.queuedUntil
    ? ` It goes out ${result.queuedUntil.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} — your send window.`
    : " It starts going out within ten minutes.";
  return {
    status: "done",
    message: `Queued for ${result.recipients.toLocaleString("en-PH")} people.${when_}`,
  };
}

/** Stop a campaign that has not finished. Queued messages are never sent. */
export async function cancelCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const who = await sender();
  if (!who) return { status: "error", message: "You can't do that." };

  const id = String(formData.get("campaignId") ?? "");
  try {
    const stopped = await systemDb(async (tx) => {
      const r = await tx.smsCampaign.updateMany({
        // `sent` is deliberately not in this list: there is no un-sending.
        where: { id, partnerId: who.partnerId, status: { in: ["scheduled", "sending", "draft"] } },
        data: { status: "cancelled" },
      });
      if (r.count > 0) {
        await tx.smsMessage.updateMany({
          where: { campaignId: id, status: "queued" },
          data: { status: "cancelled" },
        });
        await writeSeatAudit(tx, who, {
          action: "sms.campaign_cancelled",
          entityType: "sms_campaign",
          entityId: id,
        });
      }
      return r.count;
    });
    if (stopped === 0) {
      return { status: "error", message: "That campaign has already gone out." };
    }
  } catch {
    return { status: "error", message: "Couldn't stop that." };
  }

  revalidatePath("/partner/sms");
  return { status: "done", message: "Stopped. Anything not yet sent won't be." };
}
