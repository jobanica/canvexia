import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { partnerInviteEmail, inviteExpiryLabel, ROLE_BLURB } from "@servd/core";

/**
 * The staff invitation.
 *
 * `partner_invites` has existed since A1 and, until this change, NOTHING
 * consumed one — which is what the QA walkthrough meant when it said nobody
 * could actually be onboarded. These are the parts of that path that can be
 * decided without a database: the copy, the encrypted token in the queued row,
 * and the two rules a future edit could quietly break — that the raw token
 * never reaches `outbound_emails.payload`, and that a resend kills the old link.
 */

// The encryption helpers read the key at CALL time, so setting it here is
// enough. Not a real key: 32 bytes of nothing, which is all the round trip
// needs.
beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
});

const EXPIRES = new Date("2026-09-29T16:00:00.000Z"); // 30 Sep 2026, Manila.

describe("the invitation copy", () => {
  const copy = partnerInviteEmail({
    partnerName: "Tagum City Partner",
    invitedBy: "Ana Reyes",
    role: "ops_manager",
    acceptUrl: "https://canvexia.com/invite/abc123",
    expiresAt: EXPIRES,
  });

  it("leads with the PARTNER, not with CANVEXIA", () => {
    // The recipient was hired by the operator and has usually never heard of
    // CANVEXIA. A subject that leads with us reads as spam to them.
    expect(copy.subject.startsWith("Tagum City Partner")).toBe(true);
  });

  it("says what the role can do, in a sentence", () => {
    expect(copy.paragraphs).toContain(ROLE_BLURB.ops_manager);
  });

  it("carries the link and a date, not a relative window", () => {
    const body = copy.paragraphs.join("\n");
    expect(body).toContain("https://canvexia.com/invite/abc123");
    // "in 14 days" is wrong the moment the mail sits in a queue overnight.
    expect(body).toContain("30 September 2026");
    expect(body).not.toMatch(/in \d+ days/);
  });

  it("gets a/an right for every role", () => {
    for (const [role, article] of [
      ["admin", "an Admin"],
      // "an ops manager" — the vowel SOUND, which is what the rule is about.
      ["ops_manager", "an Ops manager"],
      ["sales", "a Sales"],
      ["support", "a Support"],
    ] as const) {
      const c = partnerInviteEmail({
        partnerName: "P",
        invitedBy: "A",
        role,
        acceptUrl: "https://x.test/invite/t",
        expiresAt: EXPIRES,
      });
      expect(c.paragraphs[0], role).toContain(article);
    }
  });

  it("dates in Manila, spelled out", () => {
    // 16:00 UTC is already the next day in Manila. Slicing a UTC string here
    // would print the 29th — the same off-by-one that broke the attendance day
    // key.
    expect(inviteExpiryLabel(EXPIRES)).toBe("30 September 2026");
  });
});

describe("the token in the queued row", () => {
  it("round-trips through the payload and composes the link", async () => {
    const { encryptSecret } = await import("@/lib/crypto/secrets");
    const { renderInvite } = await import("@/server/partners/invite-email");

    const rendered = renderInvite(
      {
        partnerName: "Tagum City Partner",
        role: "sales",
        invitedBy: "Ana Reyes",
        expiresAt: EXPIRES.toISOString(),
        tokenEnc: encryptSecret("tok-en-value"),
      },
      "https://canvexia.com/",
    );
    expect(rendered).not.toBeNull();
    // One slash, not two: the app URL's trailing slash is trimmed.
    expect(rendered!.paragraphs.join("\n")).toContain(
      "https://canvexia.com/invite/tok-en-value",
    );
  });

  it("refuses to send a row it cannot decrypt", async () => {
    const { renderInvite } = await import("@/server/partners/invite-email");
    // A row written under a different key. Sending it would mean mailing
    // somebody a link that can never work.
    const rendered = renderInvite(
      {
        partnerName: "P",
        role: "sales",
        invitedBy: "A",
        expiresAt: EXPIRES.toISOString(),
        tokenEnc: Buffer.from("not a real ciphertext").toString("base64"),
      },
      "https://canvexia.com",
    );
    expect(rendered).toBeNull();
  });

  it("refuses a row with no token at all", async () => {
    const { renderInvite } = await import("@/server/partners/invite-email");
    expect(
      renderInvite(
        { partnerName: "P", role: "sales", invitedBy: "A", expiresAt: EXPIRES.toISOString() },
        "https://canvexia.com",
      ),
    ).toBeNull();
  });
});

describe("the drainer's invite branch", () => {
  const row = async (payload: Record<string, unknown>) => {
    const { renderQueued } = await import("@/server/email/outbox");
    return renderQueued(
      {
        id: "e1",
        template: "partner.invite",
        toEmail: "new@example.test",
        toName: null,
        payload,
        partnerId: "p1",
        attempts: 0,
      },
      "https://canvexia.com",
    );
  };

  it("renders an invitation", async () => {
    const { encryptSecret } = await import("@/lib/crypto/secrets");
    const email = await row({
      partnerName: "Tagum City Partner",
      role: "support",
      invitedBy: "ana@example.test",
      expiresAt: EXPIRES.toISOString(),
      tokenEnc: encryptSecret("tok"),
    });
    expect(email).not.toBeNull();
    expect(email!.subject).toContain("Tagum City Partner");
    expect(email!.text).toContain("/invite/tok");
  });

  it("is not hijacked by a subject/body in its own payload", async () => {
    const { encryptSecret } = await import("@/lib/crypto/secrets");
    // The generic branch renders anything carrying composed copy. An invite row
    // that also had those keys would render WITHOUT THE LINK, which is the one
    // failure nobody would notice until a new hire said the email was empty.
    const email = await row({
      subject: "hijacked",
      body: "no link here",
      partnerName: "P",
      role: "sales",
      invitedBy: "A",
      expiresAt: EXPIRES.toISOString(),
      tokenEnc: encryptSecret("tok"),
    });
    expect(email!.subject).not.toBe("hijacked");
    expect(email!.text).toContain("/invite/tok");
  });

  it("skips, rather than fails, a row it cannot decrypt", async () => {
    // Skipping leaves it queued and visible. Marking it failed would hide an
    // invitation somebody is waiting on.
    expect(
      await row({
        partnerName: "P",
        role: "sales",
        invitedBy: "A",
        expiresAt: EXPIRES.toISOString(),
        tokenEnc: "###",
      }),
    ).toBeNull();
  });
});

describe("why the link failed", () => {
  it("has a different sentence for each reason", async () => {
    const { INVITE_MESSAGE } = await import("@/server/partners/accept-invite");
    const messages = Object.values(INVITE_MESSAGE);
    // Four reasons, four sentences. "Invalid link" for all of them teaches
    // nobody anything and produces a support message every time.
    expect(new Set(messages).size).toBe(messages.length);
    expect(INVITE_MESSAGE.revoked).not.toBe(INVITE_MESSAGE.expired);
  });

  it("hashes the token the same way the invite did", async () => {
    const { hashToken } = await import("@/server/partners/accept-invite");
    expect(hashToken("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("rejects a stub token without touching the database", async () => {
    const { findInvite } = await import("@/server/partners/accept-invite");
    const result = await findInvite("");
    expect(result).toEqual({ ok: false, problem: "unknown" });
  });
});

/**
 * Two rules that only source can hold.
 *
 * Both are invisible at runtime until the day they matter: a raw token in
 * `outbound_emails` is a live credential in an unencrypted table, and a resend
 * that leaves the old hash in place leaves two working links to one seat — one
 * of them in a mailbox somebody may no longer control.
 */
const SRC = join(__dirname, "../../src/server/partners");
/** Comments mention `token` constantly; scan the CODE. */
const codeOf = (file: string) =>
  readFileSync(join(SRC, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("what must stay true", () => {
  it("never puts a raw token in the queued payload", () => {
    const code = codeOf("invite-email.ts");
    const payload = code.slice(code.indexOf("payload: {"), code.indexOf("select: { id: true }"));
    expect(payload).toContain("tokenEnc");
    expect(payload).not.toMatch(/\btoken:\s*input\.token\b/);
  });

  it("replaces the hash on a resend, so the old link dies", () => {
    const code = codeOf("team.ts");
    const resend = code.slice(code.indexOf("export async function resendInvite"));
    expect(resend).toContain("tokenHash");
    expect(resend).toMatch(/data:\s*\{\s*tokenHash/);
  });

  it("queues the email only after the invitation has committed", () => {
    // Inside the transaction, a rollback would leave a live link to a row that
    // does not exist. queueAndLink is called from outside it.
    const code = codeOf("team.ts");
    // The end marker is the call itself rather than the variable it is
    // assigned to — a rename of the variable must not silently turn this slice
    // into "the rest of the file", which passes for the wrong reason.
    const tx = code.slice(
      code.indexOf("inviteId = await partnerDb"),
      code.indexOf("await queueAndLink(actor, {"),
    );
    expect(tx).not.toContain("queueInviteEmail");
    expect(tx).not.toContain("queueAndLink");
  });
});

/**
 * What the screen is allowed to claim.
 *
 * The first version of /team said "Invite sent" as soon as a row was QUEUED.
 * The row then sat in the outbox for up to fifteen minutes, and when the mail
 * provider rejected it — a dead API key, in the case that found this — the
 * screen had already told the admin it was sent. They go looking in a spam
 * folder for an email that never left.
 */
describe("the invite screen's claim", () => {
  const actions = codeOf("team-actions.ts");
  const ui = readFileSync(
    join(__dirname, "../../src/components/partner/TeamManager.tsx"),
    "utf8",
  );

  it("drains the invitation's own row in the request", () => {
    // Not the whole outbox, and not on the next tick: somebody is standing
    // there waiting for this one.
    expect(actions).toContain("drainOutbox(appUrl, { onlyIds: [emailId] })");
  });

  it("only says 'emailed' when the provider actually accepted it", () => {
    expect(actions).toContain('if (result.sent > 0) return { delivery: "sent" }');
    // A claimed-and-refused row is NOT reported as sent or as merely queued.
    expect(actions).toContain('delivery: result.failed > 0 ? "none" : "queued"');
  });

  it("has a different sentence for each of the three outcomes", () => {
    for (const phrase of [
      "Invite emailed to",
      "not emailed yet",
      "we couldn't email it",
    ]) {
      expect(ui, phrase).toContain(phrase);
    }
    // And never the old unconditional claim.
    expect(ui).not.toContain("`Invite sent to ${state.email}`");
  });

  it("shows the provider's own words when it refused", () => {
    // An admin can act on "API key is invalid". They cannot act on "something
    // went wrong".
    expect(ui).toContain("Mail provider said:");
    expect(actions).toContain("detail: result.errors[0]");
  });

  it("still hands over the link in every case", () => {
    // The link is the thing that works. Inboxes lose mail.
    const box = ui.slice(ui.indexOf('state.status === "invited"'));
    expect(box).toContain("{state.token}");
  });
});
