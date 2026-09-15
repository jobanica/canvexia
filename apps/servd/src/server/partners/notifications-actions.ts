"use server";

import { revalidatePath } from "next/cache";
import { isNotificationEvent, NOTIFICATION_EVENTS } from "@servd/core";
import { requireWritablePartner } from "@/server/partners/auth";
import { partnerDb } from "@/server/tenancy/scoped-db";

/**
 * Turn one notification event on or off, for the signed-in seat.
 *
 * PER SEAT, not per partner. `notification_prefs` is keyed on `partnerUserId`
 * and that is right — an admin who does not want a 7am email should not be
 * deciding that for their salesperson.
 *
 * NO CAPABILITY. Every other write in the portal asks for one; this asks for
 * none, because the thing being changed is the actor's own inbox. A `support`
 * seat that cannot see revenue can still decide whether it wants to be emailed.
 * `requireWritablePartner()` with no argument still enforces the two things
 * that matter here: approved, and not an HQ read-only session — HQ looking at a
 * partner's settings must not silence that partner's mail.
 *
 * NO AUDIT ROW. The audit log is for actions taken ON a partner's business;
 * a seat's own mail preference is neither interesting to HQ nor anybody else's
 * to review, and writing one every time somebody flips a switch would bury the
 * rows that matter.
 */
export async function setNotificationPrefAction(formData: FormData): Promise<void> {
  const who = await requireWritablePartner();
  if (!who) return;

  // A legacy login has no `partner_users` row, so there is no seat to store a
  // preference against. The settings page hides the toggles in that case; this
  // is the matching refusal.
  const userId = who.partner.user.id;
  if (!userId) return;

  const event = String(formData.get("event") ?? "").trim();
  if (!isNotificationEvent(event)) return;
  const on = String(formData.get("on") ?? "") === "true";

  try {
    await partnerDb(who.partnerId, (tx) =>
      tx.notificationPref.upsert({
        where: { partnerUserId_event: { partnerUserId: userId, event } },
        create: { partnerId: who.partnerId, partnerUserId: userId, event, email: on },
        update: { email: on },
      }),
    );
  } catch {
    /* notification_prefs not migrated — the page renders the defaults */
  }
  revalidatePath("/partner/settings");
}

/**
 * This seat's preferences, defaulted.
 *
 * A MISSING ROW IS ON. The column defaults to true and rows are only written
 * when somebody touches a switch, so treating absence as "off" would silently
 * opt out every partner who has never opened this screen — including from the
 * payment-failure notice, which is the one nobody would choose to miss.
 */
export async function getNotificationPrefs(
  partnerId: string,
  partnerUserId: string | null,
): Promise<Record<string, boolean>> {
  const defaults = Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e, true]));
  if (!partnerUserId) return defaults;
  try {
    const rows = await partnerDb(partnerId, (tx) =>
      tx.notificationPref.findMany({
        where: { partnerUserId },
        select: { event: true, email: true },
      }),
    );
    for (const r of rows) defaults[r.event] = r.email;
    return defaults;
  } catch {
    return defaults;
  }
}
