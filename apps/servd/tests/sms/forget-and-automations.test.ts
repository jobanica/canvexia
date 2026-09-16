import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mobileHash } from "@/server/partners/sms-forget";

/**
 * A8.5: the automations, and the one thing in A8 that cannot be undone.
 *
 * "Forget me" deletes a person's details and keeps a hash so an import cannot
 * quietly put them back. Every rule below is one that, reversed, would either
 * fail to delete something or fail to keep them deleted.
 */

const SRC = join(__dirname, "../../src");
const codeOf = (p: string) =>
  readFileSync(join(SRC, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the tombstone", () => {
  it("is a hash of the number, never the number", () => {
    // A table of the numbers of people who asked to be forgotten is the
    // opposite of forgetting them.
    expect(mobileHash("+639171234567")).toBe(
      createHash("sha256").update("+639171234567").digest("hex"),
    );
    expect(mobileHash("+639171234567")).not.toContain("639");
  });

  it("distinguishes two numbers", () => {
    expect(mobileHash("+639171234567")).not.toBe(mobileHash("+639171234568"));
  });
});

describe("forgetting somebody", () => {
  const forget = codeOf("server/partners/sms-forget.ts");

  it("writes the tombstone BEFORE deleting anything", () => {
    // If a later step fails, the number is still blocked from re-import. The
    // failure mode is "deleted less than we meant to", never "forgot that they
    // asked".
    const tombstone = forget.indexOf("tx.smsTombstone.upsert");
    const deletion = forget.indexOf("tx.smsContact.delete");
    expect(tombstone).toBeGreaterThan(-1);
    expect(tombstone).toBeLessThan(deletion);
  });

  it("checks the typed number against the ROW, not against the screen", () => {
    // A confirmation you can click through is not a confirmation.
    expect(forget).toContain("contact.mobile !== typed");
  });

  it("clears the number and body from past campaign rows but keeps the counts", () => {
    // A campaign that sent 400 messages still sent 400. Rewriting that would
    // be a different kind of lie.
    expect(forget).toContain("smsContactId: null, toPhone: null, body: null");
    expect(forget).not.toContain("smsCampaign.delete");
  });

  it("audits the HASH, not the number", () => {
    // An audit row recording what somebody asked to have deleted has not
    // deleted it.
    // From the CALL, not from the import at the top of the file — which is
    // where indexOf lands and would hand back the whole module.
    const audit = forget.slice(forget.indexOf("await writePartnerAudit(tx,"));
    expect(audit).toContain("mobileHash: hash");
    expect(audit).not.toContain("contact.mobile");
  });

  it("fails CLOSED when it cannot tell whether somebody was forgotten", () => {
    const check = forget.slice(forget.indexOf("export async function isForgotten"));
    const fallback = check.slice(check.indexOf("} catch {"));
    expect(fallback.slice(0, 120)).toContain("return true");
  });

  it("blocks every capture point, not just the import", () => {
    // An import is not the only way a number comes back.
    const contacts = codeOf("server/partners/sms-contacts.ts");
    const capture = contacts.slice(contacts.indexOf("export async function captureConsent"));
    expect(capture).toContain("await isForgotten(input.partnerId, mobile)");
    expect(capture.indexOf("isForgotten")).toBeLessThan(capture.indexOf("systemDb"));
  });
});

describe("the automations", () => {
  const auto = codeOf("server/partners/sms-automations.ts");

  it("re-checks consent, the cap and the window for every recipient", () => {
    // Not a per-automation choice: there is one send path and it checks all
    // three.
    const send = auto.slice(auto.indexOf("async function sendAutomated"));
    expect(send).toContain("canReceiveMarketing(contact.consentStatus)");
    expect(send).toContain("capReached(");
    expect(send).toContain("withinWindow(input.now");
  });

  it("claims before sending, so one subject gets one message", () => {
    // Writing the log after the send lets a crash between the two produce a
    // second text tomorrow.
    const send = auto.slice(auto.indexOf("async function sendAutomated"));
    const claim = send.indexOf("tx.smsAutomationLog.create");
    const provider = send.indexOf("provider.send(");
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(provider);
  });

  it("does not log a skip caused by the window, so it retries later", () => {
    // A message skipped because it is 3am must be picked up at 9am, not
    // dropped for good.
    const send = auto.slice(auto.indexOf("async function sendAutomated"));
    const beforeClaim = send.slice(0, send.indexOf("tx.smsAutomationLog.create"));
    expect(beforeClaim).toContain("withinWindow");
    expect(beforeClaim).toContain("return false");
  });

  it("keys the visit follow-up on the VISIT, not the contact", () => {
    // A second visit later deserves its own follow-up.
    expect(auto).toContain("subjectId: item.visitId");
  });

  it("uses a one-day window for stale visits", () => {
    // "N or more days ago" fires for every visit in history the first time a
    // partner switches this on.
    const stale = auto.slice(auto.indexOf("async function staleVisits"));
    expect(stale).toContain("occurredAt: { gte: from, lt: to }");
  });

  it("sends nothing at all until the partner writes the copy", () => {
    // No house copy goes out under a partner's name.
    expect(auto).toContain("partner.smsAutoWelcomeText?.trim()");
    expect(auto).toContain("partner.smsAutoVisitText?.trim()");
    expect(auto).toContain("partner.smsAutoTrialText?.trim()");
  });
});

describe("campaign analytics", () => {
  const analytics = codeOf("server/partners/sms-analytics.ts");

  it("reports delivered as null rather than inventing it", () => {
    // Zero reads as "nothing arrived"; copying `sent` is a claim we cannot
    // support. The aggregator has never been wired to send us receipts.
    expect(analytics).toContain("delivered: null");
    expect(analytics).not.toMatch(/delivered:\s*campaign\.sentCount/);
  });

  it("counts opt-outs that happened AFTER the campaign went out", () => {
    // Counting earlier ones makes every campaign look worse than it was.
    expect(analytics).toContain("optedOutAt: { gte: from }");
  });

  it("measures conversions from the audit log, not the current stage", () => {
    // A prospect that is `paid` today might have been paid before the campaign
    // ever went out.
    expect(analytics).toContain('action: "prospect.stage"');
    expect(analytics).toContain("ATTRIBUTION_DAYS");
  });
});

describe("the pass-through rollup", () => {
  it("is written by every send path, so the statement is not zero", () => {
    // `passthrough_usage` has had a reader since the HQ billing screen shipped
    // and nothing ever wrote to it — so every pass-through line read zero.
    for (const file of [
      "server/partners/sms-campaigns.ts",
      "server/partners/sms-inbox.ts",
      "server/partners/sms-automations.ts",
    ]) {
      expect(codeOf(file), file).toContain("recordSmsUsage(");
    }
  });

  it("counts only what the aggregator will bill us for", () => {
    // A refused message is not billed, and its credit has already been
    // refunded — counting it would overstate the cost on the statement.
    const campaigns = codeOf("server/partners/sms-campaigns.ts");
    const branch = campaigns.slice(campaigns.indexOf("if (result.ok) {"));
    expect(branch.slice(0, 400)).toContain("recordSmsUsage");
  });

  it("keys the month in Manila", () => {
    const usage = codeOf("server/partners/sms-usage.ts");
    expect(usage).toContain("MANILA_OFFSET_MS");
    // Shift, then slice — the same trap that once filed every check-in against
    // the previous day.
    expect(usage).toContain("at.getTime() + MANILA_OFFSET_MS");
  });
});
