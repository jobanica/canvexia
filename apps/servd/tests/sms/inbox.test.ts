import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Two-way SMS.
 *
 * The reply path has three rules that are each one edit away from being
 * reversed, and each reversal is invisible until somebody complains: a reply
 * is not marketing (so no cap and no opt-out line), the send window bends for
 * somebody who just texted you, and an inbound message must reach a person.
 */

const SRC = join(__dirname, "../../src");
const codeOf = (p: string) =>
  readFileSync(join(SRC, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const inbox = codeOf("server/partners/sms-inbox.ts");

describe("a 1:1 reply", () => {
  it("carries NO opt-out line", () => {
    // It is transactional. Telling somebody who asked you a question how to
    // unsubscribe reads as a brush-off.
    const reply = inbox.slice(inbox.indexOf("export async function sendReply"));
    expect(reply).toContain("provider.send(sender.senderName, input.phone, body)");
    expect(reply).not.toContain("withOptOut");
  });

  it("is not subject to the frequency cap", () => {
    // The cap is about marketing. Somebody who texted three questions in a
    // week should get three answers.
    const reply = inbox.slice(inbox.indexOf("export async function sendReply"));
    expect(reply).not.toContain("capReached");
  });

  it("still costs credits, because the network still charges us", () => {
    const reply = inbox.slice(inbox.indexOf("export async function sendReply"));
    expect(reply).toContain('debit(input.partnerId, segments, "sms_reply")');
    // And it is paid BEFORE the send, as campaigns are.
    expect(reply.indexOf("await debit(")).toBeLessThan(reply.indexOf("await provider.send("));
  });

  it("bends the send window for somebody who texted within a day", () => {
    // 24 hours, and the check is for an INBOUND message: an outbound one would
    // let a seat reset the clock by texting first.
    const reply = inbox.slice(inbox.indexOf("export async function sendReply"));
    expect(reply).toContain('direction: "in"');
    expect(inbox).toContain("const RECENTLY_MS = 24 * 60 * 60 * 1000");
    // …and refuses, with the time it CAN be sent, when they have not.
    expect(reply).toContain("nextSendTime(now, window)");
  });
});

describe("an inbound message", () => {
  const record = inbox.slice(
    inbox.indexOf("export async function recordInbound"),
    inbox.indexOf("export type ReplyResult"),
  );

  it("is filed for every partner that knows the number", () => {
    // One platform sender name means we cannot always tell which operator a
    // reply was meant for. Filing it against a guess hides it from the operator
    // who needs it.
    expect(record).toContain("tx.smsContact.findMany");
    expect(record).toContain("where: { mobile: phone }");
  });

  it("notifies the assigned seat, falling back to the managers", () => {
    // A reply that notifies nobody is a reply nobody answers.
    expect(record).toContain("managerSeats(contact.partnerId)");
    expect(record).toContain("queueNotification");
    expect(record).toContain('event: "sms.reply"');
  });

  it("reaches the inbox at all — the webhook no longer drops it", () => {
    // Before A8.4 this route classified anything that was not STOP or YES and
    // then did nothing with it.
    const route = codeOf("app/api/webhooks/sms/route.ts");
    expect(route).toContain("recordInbound(phone, inbound.text, now)");
  });
});

describe("who sees which threads", () => {
  it("shows an UNASSIGNED thread to everybody, not to nobody", () => {
    // A message from a number nobody owns is exactly the one that would
    // otherwise sit unanswered for a week.
    const list = inbox.slice(inbox.indexOf("export async function listThreads"));
    expect(list).toContain("t.assignedToId === null");
  });

  it("filters to the seat's own threads when they only hold reply_own", () => {
    const page = readFileSync(
      join(SRC, "app/(platform)/partner/sms/inbox/page.tsx"),
      "utf8",
    );
    expect(page).toContain("assignedToId: seesAll ? null : partner.user.id");
  });
});
