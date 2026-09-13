"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { getSmsProvider } from "@/server/sms";
import { adjustCredits } from "@/server/sms/credits";

/** Count of contacts eligible for marketing (confirmed + not opted out). */
export async function getConfirmedCount(restaurantId: string): Promise<number> {
  return tenantDb(restaurantId, (tx) =>
    tx.customerContact.count({ where: { marketingConsent: "confirmed" } }),
  );
}

/** Campaign history with per-status message counts. */
export async function getCampaigns(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.smsCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { messages: true } } },
    }),
  );
}

const sendSchema = z.object({ body: z.string().trim().min(1).max(600) });

/**
 * Sends a campaign to CONFIRMED, non-opted-out contacts only. Meters credits
 * (1 per recipient) against the restaurant's balance, then sends via the
 * platform provider using the restaurant's registered sender name.
 */
export async function sendCampaign(input: {
  body: string;
}): Promise<{ ok: boolean; sent?: number; failed?: number; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["admin", "manager"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Message can't be empty." };

  const restaurant = await tenantDb(staff.restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { smsSenderName: true } }),
  );
  const provider = getSmsProvider();
  if (!provider) return { ok: false, error: "SMS isn't configured on the platform yet." };
  if (!restaurant.smsSenderName) {
    return { ok: false, error: "No registered sender name yet — contact the platform admin." };
  }

  // Recipients: confirmed marketing consent ONLY. Opted-out/pending excluded.
  const contacts = await tenantDb(staff.restaurantId, (tx) =>
    tx.customerContact.findMany({
      where: { marketingConsent: "confirmed" },
      select: { id: true, phone: true },
    }),
  );
  if (contacts.length === 0) {
    return { ok: false, error: "No confirmed subscribers to send to." };
  }

  // Reserve credits up front (1 per recipient); aborts if insufficient.
  try {
    await adjustCredits(staff.restaurantId, -contacts.length, "sms_campaign");
  } catch {
    return {
      ok: false,
      error: `Not enough SMS credits (need ${contacts.length}).`,
    };
  }

  const campaign = await tenantDb(staff.restaurantId, (tx) =>
    tx.smsCampaign.create({
      data: {
        restaurantId: staff.restaurantId,
        body: parsed.data.body,
        sentAt: new Date(),
        recipientCount: contacts.length,
      },
      select: { id: true },
    }),
  );

  let sent = 0;
  let failed = 0;
  for (const c of contacts) {
    const res = await provider.send(restaurant.smsSenderName, c.phone, parsed.data.body);
    if (res.ok) sent++;
    else failed++;
    await tenantDb(staff.restaurantId, (tx) =>
      tx.smsMessage.create({
        data: {
          campaignId: campaign.id,
          contactId: c.id,
          status: res.ok ? "sent" : "failed",
          providerRef: res.providerRef ?? null,
        },
      }),
    );
  }

  revalidatePath("/admin/sms");
  return { ok: true, sent, failed };
}

/** Admin toggles double vs single opt-in for their restaurant. */
export async function setDoubleOptIn(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  const enabled = formData.get("doubleOptIn") === "on";
  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({ where: { id: restaurantId }, data: { smsDoubleOptIn: enabled }, select: { id: true } }),
  );
  revalidatePath("/admin/sms");
}
