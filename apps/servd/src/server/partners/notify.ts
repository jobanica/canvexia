import "server-only";
import { DIGEST_EVENTS } from "@servd/db";
import { isNotificationEvent, type NotificationEvent } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Queue one notification, to the people who asked for it.
 *
 * QUEUED, NOT SENT, for the reason the digest is: `CREDENTIALS_ENCRYPTION_KEY`
 * is unset on this project, so Resend's key cannot even be stored and no code
 * path here can put mail on the wire. The row goes into `outbound_emails` and a
 * sender drains it the day that key exists.
 *
 * BEST EFFORT, ALWAYS. Every caller is in the middle of doing something that
 * matters more — logging a visit, freezing a statement — and a notification
 * that cannot be queued must not roll that back. Failures are swallowed here
 * rather than at twelve call sites.
 *
 * A MISSING PREFERENCE ROW MEANS YES. The column defaults to true and rows are
 * written only when somebody touches a switch, so treating absence as "off"
 * would silently opt out every partner who has never opened the settings
 * screen — including from the payment-failure notice, which is the one nobody
 * would choose to miss.
 */
export async function queueNotification(input: {
  partnerId: string;
  event: NotificationEvent | string;
  /** The seats to tell. Resolved by the caller, because only it knows who. */
  to: { id: string; email: string; name: string | null }[];
  subject: string;
  body: string;
}): Promise<number> {
  if (!isNotificationEvent(input.event)) return 0;
  if (input.to.length === 0) return 0;

  try {
    return await systemDb(async (tx) => {
      const prefs = await tx.notificationPref
        .findMany({
          where: { partnerUserId: { in: input.to.map((t) => t.id) }, event: input.event },
          select: { partnerUserId: true, email: true },
        })
        .catch(() => [] as { partnerUserId: string; email: boolean }[]);
      const off = new Set(prefs.filter((p) => !p.email).map((p) => p.partnerUserId));

      const rows = input.to
        .filter((t) => !off.has(t.id))
        .map((t) => ({
          template: `partner.${input.event}`,
          toEmail: t.email,
          toName: t.name,
          partnerId: input.partnerId,
          payload: { subject: input.subject, body: input.body },
        }));
      if (rows.length === 0) return 0;
      await tx.outboundEmail.createMany({ data: rows });
      return rows.length;
    });
  } catch {
    return 0;
  }
}

/**
 * The seats that manage the team: admins and ops managers.
 *
 * Resolved by ROLE rather than by permission, deliberately. `hr.view_all` is
 * editable per partner, and an operator who granted it to their salespeople so
 * they could see a shared scorecard would start mailing every salesperson a
 * list of who did not turn up. The audience for "somebody did not check in" is
 * the people who manage them, and that is a role question.
 */
export async function managerSeats(
  partnerId: string,
): Promise<{ id: string; email: string; name: string | null }[]> {
  try {
    return await systemDb((tx) =>
      tx.partnerUser.findMany({
        where: { partnerId, status: "active", role: { in: ["admin", "ops_manager"] } },
        select: { id: true, email: true, name: true },
      }),
    );
  } catch {
    return [];
  }
}

/** One seat, when it is still active. Null for a seat that has been offboarded. */
export async function activeSeat(
  partnerId: string,
  partnerUserId: string,
): Promise<{ id: string; email: string; name: string | null } | null> {
  try {
    return await systemDb((tx) =>
      tx.partnerUser.findFirst({
        where: { id: partnerUserId, partnerId, status: "active" },
        select: { id: true, email: true, name: true },
      }),
    );
  } catch {
    return null;
  }
}

/** Which events the daily digest already covers, so nothing is said twice. */
export const COVERED_BY_DIGEST: readonly NotificationEvent[] = DIGEST_EVENTS;
