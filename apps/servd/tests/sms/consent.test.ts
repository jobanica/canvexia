import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONSENT_LABEL,
  DEFAULT_OPT_OUT_TEXT,
  STOP_WORDS,
  canReceiveMarketing,
  classifyReply,
  consentEvidence,
  whyNotSendable,
  withOptOut,
} from "@servd/core";

/**
 * Consent, which is the only part of an SMS product that can get somebody
 * fined.
 *
 * Every rule here comes from the brief or from the PH Data Privacy Act's
 * consent standard, and each one is the kind that looks like a detail until the
 * day somebody complains: what "unknown" means, whether an opt-out can be
 * undone, whether the opt-out line can be dropped, and whether TIGIL counts.
 */

describe("who may be sent to", () => {
  it("is opted_in and nothing else", () => {
    expect(canReceiveMarketing("opted_in")).toBe(true);
    // `unknown` is NOT a soft yes. Nobody has asked them.
    expect(canReceiveMarketing("unknown")).toBe(false);
    expect(canReceiveMarketing("opted_out")).toBe(false);
    expect(canReceiveMarketing("")).toBe(false);
    expect(canReceiveMarketing("OPTED_IN")).toBe(false);
  });

  it("says WHY somebody cannot be sent to, and says different things", () => {
    // "Opted out" is final; "not asked" is a conversation somebody could have
    // this afternoon. Greying both out with no reason hides that difference.
    expect(whyNotSendable("opted_in")).toBeNull();
    const out = whyNotSendable("opted_out");
    const unknown = whyNotSendable("unknown");
    expect(out).not.toBe(unknown);
    expect(out).toMatch(/new consent/i);
    expect(CONSENT_LABEL.unknown).toBe("Not asked");
  });
});

describe("the opt-out line", () => {
  it("is appended to every marketing message", () => {
    expect(withOptOut("Big sale today")).toBe(`Big sale today\n${DEFAULT_OPT_OUT_TEXT}`);
  });

  it("can be reworded but not removed", () => {
    expect(withOptOut("Sale", "Reply TIGIL para tumigil.")).toBe(
      "Sale\nReply TIGIL para tumigil.",
    );
    // An empty or whitespace override falls back rather than producing a
    // message with no way out of it.
    expect(withOptOut("Sale", "")).toContain(DEFAULT_OPT_OUT_TEXT);
    expect(withOptOut("Sale", "   ")).toContain(DEFAULT_OPT_OUT_TEXT);
    expect(withOptOut("Sale", null)).toContain(DEFAULT_OPT_OUT_TEXT);
  });

  it("is not added twice when the body already ends with it", () => {
    const once = withOptOut("Sale");
    expect(withOptOut(once)).toBe(once);
  });
});

describe("what counts as STOP", () => {
  it("includes the Tagalog words a Filipino recipient actually texts", () => {
    // An English-only list means their opt-out silently becomes an inbox
    // message nobody treats as a withdrawal of consent.
    for (const word of ["TIGIL", "tigil", "Alis", "ALIS", "hinto", "ayaw"]) {
      expect(classifyReply(word), word).toBe("stop");
    }
  });

  it("still handles the English ones, punctuation and all", () => {
    for (const word of ["STOP", "stop.", "unsubscribe", "Cancel!", "quit"]) {
      expect(classifyReply(word), word).toBe("stop");
    }
  });

  it("reads the two-word forms the brief names", () => {
    // A first-word match sees "opt" and files it as a question.
    expect(classifyReply("OPT OUT")).toBe("stop");
    expect(classifyReply("opt out please")).toBe("stop");
    expect(classifyReply("opt-out")).toBe("stop");
    expect(classifyReply("tama na")).toBe("stop");
    expect(classifyReply("stop all texts")).toBe("stop");
  });

  it("does not turn an ordinary message into an opt-out", () => {
    for (const text of [
      "what time do you open?",
      "can you stop by tomorrow?",
      "",
      "salamat",
    ]) {
      expect(classifyReply(text), text).not.toBe("stop");
    }
  });

  it("publishes the list, so a screen can tell people what works", () => {
    expect(STOP_WORDS).toContain("tigil");
    expect(STOP_WORDS).toContain("opt out");
  });
});

describe("the evidence sentence", () => {
  const at = new Date("2026-09-15T02:00:00.000Z");

  it("names who, when and how, in a sentence a non-engineer can read", () => {
    const visit = consentEvidence({ source: "visit", staffName: "Ana Reyes", at });
    expect(visit).toContain("Ana Reyes");
    expect(visit).toContain("2026-09-15");
    expect(visit).toMatch(/visit/i);
  });

  it("stores the form's own wording, not a reference to it", () => {
    // What somebody agreed to is the sentence they were shown. Re-deriving it
    // later from whatever the component says today rewrites history.
    const wording = "Yes, Tagum City Partner may text me about their services.";
    expect(consentEvidence({ source: "lead_form", at, detail: wording })).toContain(wording);
  });

  it("carries the import attestation word for word", () => {
    const attestation = "Signed forms collected at the Tagum trade fair, March 2026.";
    const text = consentEvidence({
      source: "import_attested",
      at,
      staffName: "Ana Reyes",
      detail: attestation,
    });
    expect(text).toContain(attestation);
    expect(text).toContain("Ana Reyes");
  });
});

/**
 * Three rules that live in server code and can only be held from source here —
 * each of them the kind of thing a later edit would undo without noticing.
 */
const SRC = join(__dirname, "../../src");
const codeOf = (p: string) =>
  readFileSync(join(SRC, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("what must stay true", () => {
  it("never moves an opted-out contact back on its own", () => {
    // The only way back is a new consent event in the real world. A capture
    // that quietly re-opts somebody in is the single worst bug this module
    // could have, and it would look like a feature in review.
    const code = codeOf("server/partners/sms-contacts.ts");
    const capture = code.slice(code.indexOf("export async function captureConsent"));
    expect(capture).toContain('existing?.consentStatus === "opted_out"');
    expect(capture).toMatch(/locked\s*\n?\s*\?\s*"opted_out"/);
    // And no action offers a way to do it by hand.
    const actions = codeOf("server/partners/sms-contacts-actions.ts");
    expect(actions).not.toMatch(/consentStatus:\s*"opted_in"/);
  });

  it("opts out across every partner, by number alone", () => {
    const code = codeOf("server/partners/sms-contacts.ts");
    const fn = code.slice(code.indexOf("export async function optOutEverywhere"));
    const where = fn.slice(fn.indexOf("where: { mobile: number }"));
    expect(where).toBeTruthy();
    expect(fn).not.toMatch(/where:\s*\{\s*mobile:\s*number,\s*partnerId/);
  });

  it("sends the opt-out confirmation once, not once per partner", () => {
    // Somebody who texts STOP three times must not get three texts back.
    const route = codeOf("app/api/webhooks/sms/route.ts");
    expect(route).toContain("filter((a) => !a.confirmed)");
    expect(route).toContain("markOptOutConfirmed");
  });

  it("appends the opt-out line in the one place partner marketing is sent", () => {
    const send = codeOf("server/partners/sms-send.ts");
    expect(send).toContain("withOptOut(body, sender.optOutText)");
    // The confirmation deliberately does NOT carry it: telling somebody who
    // just opted out how to opt out is noise.
    const confirm = send.slice(send.indexOf("sendOptOutConfirmation"));
    expect(confirm).not.toContain("withOptOut");
  });

  it("keeps the lead-form box unticked and unbundled", () => {
    const form = readFileSync(join(SRC, "components/partner/LeadForm.tsx"), "utf8");
    const box = form.slice(form.indexOf('name="smsConsent"'));
    expect(box.slice(0, 200)).not.toContain("defaultChecked");
    expect(box.slice(0, 200)).not.toContain("checked={true}");
  });
});
