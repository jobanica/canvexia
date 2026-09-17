import { describe, it, expect } from "vitest";
import { permissionDefault, PERMISSIONS_WITHOUT_SCREENS, type PartnerUserRole } from "@servd/core";
import { codeAt } from "../support/source";

/**
 * A MERCHANT'S MESSAGE REACHES WHOEVER SOLD THEM THE SOFTWARE.
 *
 * REPORTED — "yes build the feedback inbox to partners." The "Send feedback"
 * button in a merchant's dashboard wrote to one table that only Servd's
 * super-admin could read, under a panel saying "This goes straight to the Servd
 * team". For a partner-sold shop that was both wrong and useless: they signed
 * with their partner, pay their partner, and would ring their partner. The
 * partner never learned they wrote.
 *
 * `support.tickets` has been in the A7 grid since it was written, carrying a
 * comment that it had no screen anywhere in this repository. This is that
 * screen — the permission described a job nobody could do.
 */

const inbox = codeAt("src/app/(platform)/partner/feedback/page.tsx");
const queries = codeAt("src/server/partners/feedback.ts");
const action = codeAt("src/server/partners/feedback-actions.ts");
const submit = codeAt("src/server/platform-feedback/actions.ts");

describe("the message is addressed when it is sent", () => {
  it("stamps the partner at submission", () => {
    expect(submit).toContain("partnerId: r?.partnerId ?? null");
  });

  it("stamps rather than joining", () => {
    // HQ reassigns merchants between partners. A live join would silently move
    // every past conversation into the new partner's inbox.
    expect(queries).not.toContain("restaurant: {");
    expect(queries).toContain("where: { partnerId }");
  });

  it("leaves a direct-from-Servd shop exactly as it was", () => {
    // Null partnerId is the original behaviour, and it still is.
    expect(submit).toContain("?? null");
  });
});

describe("the inbox is the partner's and only the partner's", () => {
  it("scopes every read by the session's partner id", () => {
    // platform_feedback has no anon or authenticated grant, so this WHERE
    // clause is the whole tenant boundary.
    expect(queries.split("where: { partnerId").length - 1).toBe(2);
  });

  it("puts ownership in the WHERE clause of the write, not a check before it", () => {
    // A request naming somebody else's message updates zero rows, rather than
    // passing a check that ran against a row this partner could not see.
    expect(action).toContain("where: { id, partnerId: who.partnerId }");
    expect(action).toContain("if (!done) return { error:");
  });

  it("gates on the permission that already described this job", () => {
    expect(inbox).toContain('requirePartnerPageWith("support.tickets")');
    expect(action).toContain('requireWritablePartner("support.tickets")');
  });

  it("is held by support and not by sales", () => {
    // Answering for a shop that already exists is support's job, not a
    // salesperson's.
    for (const role of ["admin", "ops_manager", "support"] as PartnerUserRole[]) {
      expect(permissionDefault(role, "support.tickets"), role).toBe(true);
    }
    expect(permissionDefault("sales" as PartnerUserRole, "support.tickets")).toBe(false);
  });

  it("no longer claims the permission has no screen", () => {
    expect(PERMISSIONS_WITHOUT_SCREENS).not.toContain("support.tickets");
    // The other one genuinely still has none.
    expect(PERMISSIONS_WITHOUT_SCREENS).toContain("merchants.login_as");
  });
});

describe("the badge is honest", () => {
  const shell = codeAt("src/components/partner/PortalShell.tsx");

  it("counts unanswered, not unread", () => {
    // There is no "read" for a partner to record, and inventing one gives a
    // badge that clears when somebody glances at the page.
    expect(queries).toContain("where: { partnerId, reply: null }");
  });

  it("appears on every screen, not only the one that loaded the rows", () => {
    // A badge that shows on the page you are already looking at is a badge
    // nobody sees.
    expect(shell).toContain("await unansweredFeedbackCount(partner.id)");
  });

  it("costs nothing for a seat that could not act on it", () => {
    expect(shell).toContain('partner.permissions.has("support.tickets")');
  });

  it("shows unanswered messages first", () => {
    // The opposite order to the merchant's own list, and for the opposite
    // reason: they open theirs looking for the answer.
    expect(queries).toContain("Number(!!a.reply) - Number(!!b.reply)");
  });
});

describe("the merchant is told who they are writing to", () => {
  const button = codeAt("src/components/admin/PlatformFeedbackButton.tsx");

  it("names the partner instead of Servd", () => {
    expect(button).not.toContain("straight to the Servd team.");
    expect(button).toContain("{who ? <strong>{who}</strong> : \"the Servd team\"}");
  });

  it("names them on the reply too", () => {
    // "Servd replied" over a partner's words names the wrong company.
    expect(button).toContain('{who ?? "Servd"} replied');
  });

  it("does not say the name twice when a partner is called Servd", () => {
    expect(button).toContain('vendor.trim() !== "Servd"');
  });

  it("reaches them where they already read replies", () => {
    // The partner's answer goes in the same column Servd's always did, so
    // nothing on the merchant side needed building.
    expect(action).toContain("reply,");
    expect(action).toContain("replyReadAt: null");
  });
});

describe("Servd can see it without replying over the top", () => {
  const page = codeAt("src/app/(platform)/super-admin/feedback/page.tsx");

  it("flags whose merchant it is", () => {
    expect(page).toContain("theirs to answer");
  });

  it("says when the partner has already answered", () => {
    expect(page).toContain("f.answeredByPartner");
    expect(codeAt("src/server/partners/feedback.ts")).toContain("repliedByPartnerId === partnerId");
  });
});

describe("the reply is recorded and the conversation is not", () => {
  it("audits that an answer was sent", () => {
    expect(action).toContain('action: "partner.feedback_replied"');
  });

  it("does not copy what was said into the audit log", () => {
    const after = action.slice(action.indexOf("after: {"));
    expect(after.slice(0, 60)).not.toContain("reply");
    expect(after.slice(0, 60)).toContain("replied: true");
  });
});
