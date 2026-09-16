import "server-only";
import { countSegments, nextSendTime, withinWindow } from "@servd/core";
import { systemDb, partnerDb } from "@/server/tenancy/scoped-db";
import { getSmsProvider } from "@/server/sms";
import { partnerSender } from "./sms-send";
import { partnerSmsLimits } from "./sms-campaigns";
import { debit } from "./sms-wallet";
import { managerSeats, queueNotification } from "./notify";

/**
 * Two-way SMS: what came back, and what a seat said to it.
 *
 * A REPLY IS TRANSACTIONAL, NOT MARKETING, and three rules follow from that:
 * it is not subject to the frequency cap, it carries no opt-out line, and —
 * per the brief — it may go out at ANY hour if the contact themselves texted
 * within the last 24 hours. Somebody who messages at 9pm is awake and waiting
 * for an answer; making them wait until 9am to be told their order is ready is
 * the send window used against the person it protects.
 */

/** The window does not apply to somebody who just texted us. */
const RECENTLY_MS = 24 * 60 * 60 * 1000;

export interface ThreadSummary {
  contactId: string | null;
  phone: string;
  name: string | null;
  businessName: string | null;
  lastBody: string;
  lastAt: Date;
  lastDirection: string;
  unread: number;
  /** The seat this contact's prospect belongs to, when there is one. */
  assignedToId: string | null;
}

/**
 * The inbox: one row per conversation, newest first.
 *
 * Built from two flat reads rather than a query per thread. A partner has
 * hundreds of conversations, not millions, and a loop of queries here is a loop
 * of transactions.
 */
export async function listThreads(
  partnerId: string,
  opts: { assignedToId?: string | null } = {},
): Promise<ThreadSummary[]> {
  let rows: {
    smsContactId: string | null;
    phone: string;
    body: string;
    direction: string;
    readAt: Date | null;
    createdAt: Date;
  }[] = [];
  try {
    rows = await partnerDb(partnerId, (tx) =>
      tx.smsThreadMessage.findMany({
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: {
          smsContactId: true,
          phone: true,
          body: true,
          direction: true,
          readAt: true,
          createdAt: true,
        },
      }),
    );
  } catch {
    return [];
  }
  if (rows.length === 0) return [];

  const byPhone = new Map<string, ThreadSummary>();
  for (const row of rows) {
    const existing = byPhone.get(row.phone);
    if (!existing) {
      byPhone.set(row.phone, {
        contactId: row.smsContactId,
        phone: row.phone,
        name: null,
        businessName: null,
        lastBody: row.body,
        lastAt: row.createdAt,
        lastDirection: row.direction,
        unread: row.direction === "in" && !row.readAt ? 1 : 0,
        assignedToId: null,
      });
      continue;
    }
    if (row.direction === "in" && !row.readAt) existing.unread += 1;
    if (!existing.contactId && row.smsContactId) existing.contactId = row.smsContactId;
  }

  // Names and assignment, in one pass.
  const ids = [...byPhone.values()].map((t) => t.contactId).filter((id): id is string => !!id);
  if (ids.length > 0) {
    try {
      const contacts = await partnerDb(partnerId, (tx) =>
        tx.smsContact.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, businessName: true, prospectId: true },
        }),
      );
      const prospectIds = contacts
        .map((c) => c.prospectId)
        .filter((id): id is string => !!id);
      const prospects = prospectIds.length
        ? await partnerDb(partnerId, (tx) =>
            tx.prospect.findMany({
              where: { id: { in: prospectIds } },
              select: { id: true, assignedToId: true },
            }),
          )
        : [];
      const assignee = new Map(prospects.map((p) => [p.id, p.assignedToId]));
      const byId = new Map(contacts.map((c) => [c.id, c]));
      for (const thread of byPhone.values()) {
        const contact = thread.contactId ? byId.get(thread.contactId) : undefined;
        if (!contact) continue;
        thread.name = contact.name;
        thread.businessName = contact.businessName;
        thread.assignedToId = contact.prospectId
          ? (assignee.get(contact.prospectId) ?? null)
          : null;
      }
    } catch {
      /* the threads still list, without names */
    }
  }

  const threads = [...byPhone.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  // `sms.reply_own` sees only their own. An UNASSIGNED thread is shown to
  // everybody rather than to nobody: a message from a number nobody owns is
  // exactly the one that would otherwise sit unanswered for a week.
  if (opts.assignedToId) {
    return threads.filter(
      (t) => t.assignedToId === opts.assignedToId || t.assignedToId === null,
    );
  }
  return threads;
}

export async function readThread(partnerId: string, phone: string) {
  try {
    return await partnerDb(partnerId, (tx) =>
      tx.smsThreadMessage.findMany({
        where: { phone },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          direction: true,
          body: true,
          createdAt: true,
          sentByUserId: true,
        },
      }),
    );
  } catch {
    return [];
  }
}

export async function markThreadRead(partnerId: string, phone: string): Promise<void> {
  try {
    await systemDb((tx) =>
      tx.smsThreadMessage.updateMany({
        where: { partnerId, phone, direction: "in", readAt: null },
        data: { readAt: new Date() },
      }),
    );
  } catch {
    /* an unread badge that lingers is not worth failing a page load for */
  }
}

/**
 * File an inbound message and tell somebody about it.
 *
 * RECORDED FOR EVERY PARTNER THAT KNOWS THE NUMBER. One platform sender name
 * means we cannot always tell which operator a reply was meant for — the person
 * texted back to whatever number their phone showed. Filing it once against a
 * guess would hide it from the operator who actually needs it; filing it for
 * each partner who has that contact shows it to the people who might recognise
 * them.
 *
 * A number nobody has is filed against no partner and simply dropped, because
 * there is no operator it could belong to.
 */
export async function recordInbound(
  phone: string,
  body: string,
  at: Date = new Date(),
): Promise<number> {
  let contacts: { id: string; partnerId: string; name: string | null; prospectId: string | null }[] =
    [];
  try {
    contacts = await systemDb((tx) =>
      tx.smsContact.findMany({
        where: { mobile: phone },
        select: { id: true, partnerId: true, name: true, prospectId: true },
      }),
    );
  } catch {
    return 0;
  }
  if (contacts.length === 0) return 0;

  let filed = 0;
  for (const contact of contacts) {
    try {
      await systemDb((tx) =>
        tx.smsThreadMessage.create({
          data: {
            partnerId: contact.partnerId,
            smsContactId: contact.id,
            phone,
            direction: "in",
            body: body.slice(0, 1600),
          },
          select: { id: true },
        }),
      );
      filed += 1;
    } catch {
      continue;
    }

    // Routed to the assigned seat, falling back to the managers. A reply that
    // notifies nobody is a reply nobody answers.
    let to: { id: string; email: string; name: string | null }[] = [];
    try {
      const assigned = contact.prospectId
        ? await systemDb((tx) =>
            tx.prospect.findUnique({
              where: { id: contact.prospectId as string },
              select: { assignedTo: { select: { id: true, email: true, name: true } } },
            }),
          )
        : null;
      to = assigned?.assignedTo
        ? [assigned.assignedTo]
        : await managerSeats(contact.partnerId);
    } catch {
      to = await managerSeats(contact.partnerId);
    }

    await queueNotification({
      partnerId: contact.partnerId,
      event: "sms.reply",
      to,
      subject: `${contact.name ?? phone} texted back`,
      body: `${contact.name ?? phone} replied:\n\n"${body.slice(0, 400)}"\n\nAnswer in the SMS inbox.`,
    });
  }

  return filed;
}

export type ReplyResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Answer one person.
 *
 * NOT SUBJECT TO THE FREQUENCY CAP — that cap is about marketing, and a reply
 * to somebody's question is not marketing. The SEND WINDOW still applies unless
 * they texted within the last 24 hours, which is the brief's rule and the right
 * one: somebody who messages at 9pm is awake and waiting.
 *
 * It costs credits, because the network charges us for it either way.
 */
export async function sendReply(input: {
  partnerId: string;
  phone: string;
  body: string;
  seatId: string | null;
  now?: Date;
}): Promise<ReplyResult> {
  const now = input.now ?? new Date();
  const body = input.body.trim();
  if (!body) return { ok: false, message: "Write something first." };
  if (body.length > 800) return { ok: false, message: "That's too long to send." };

  const limits = await partnerSmsLimits(input.partnerId);
  const window = { startMin: limits.windowStartMin, endMin: limits.windowEndMin };

  if (!withinWindow(now, window)) {
    let recent = 0;
    try {
      recent = await systemDb((tx) =>
        tx.smsThreadMessage.count({
          where: {
            partnerId: input.partnerId,
            phone: input.phone,
            direction: "in",
            createdAt: { gte: new Date(now.getTime() - RECENTLY_MS) },
          },
        }),
      );
    } catch {
      recent = 0;
    }
    if (recent === 0) {
      const next = nextSendTime(now, window);
      return {
        ok: false,
        message: `Outside your send window, and they haven't texted in the last day. You can send from ${next.toLocaleString(
          "en-PH",
          { timeZone: "Asia/Manila", timeStyle: "short", dateStyle: "medium" },
        )}.`,
      };
    }
  }

  const segments = countSegments(body).segments;
  const paid = await debit(input.partnerId, segments, "sms_reply");
  if (!paid.ok) {
    return { ok: false, message: "You're out of SMS credits. Top up to reply." };
  }

  const provider = getSmsProvider();
  if (!provider) return { ok: false, message: "SMS isn't configured on the platform." };
  const sender = await partnerSender(input.partnerId);

  // NO opt-out line: this is a transactional reply, and telling somebody who
  // asked you a question how to unsubscribe reads as a brush-off.
  const result = await provider.send(sender.senderName, input.phone, body);
  if (!result.ok) {
    return { ok: false, message: result.error ?? "That didn't send." };
  }

  try {
    await systemDb(async (tx) => {
      const contact = await tx.smsContact.findFirst({
        where: { partnerId: input.partnerId, mobile: input.phone },
        select: { id: true },
      });
      await tx.smsThreadMessage.create({
        data: {
          partnerId: input.partnerId,
          smsContactId: contact?.id ?? null,
          phone: input.phone,
          direction: "out",
          body,
          sentByUserId: input.seatId,
          providerRef: result.providerRef ?? null,
          segments,
        },
        select: { id: true },
      });
    });
  } catch {
    /* it went out; the thread catches up on the next inbound */
  }

  return { ok: true };
}

/** Unread count, for the nav badge. */
export async function unreadCount(partnerId: string): Promise<number> {
  try {
    return await partnerDb(partnerId, (tx) =>
      tx.smsThreadMessage.count({ where: { direction: "in", readAt: null } }),
    );
  } catch {
    return 0;
  }
}
