import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderQueued } from "@/server/email/outbox";

/**
 * The drainer.
 *
 * `outbound_emails` has been accumulating since H3 with nothing taking rows
 * out. These are the rules that decide what actually leaves — and the two
 * orderings that, got wrong, either lose somebody's welcome email or send it
 * four times.
 */

const row = (over: Partial<Parameters<typeof renderQueued>[0]> = {}) => ({
  id: "e1",
  template: "partner.digest",
  toEmail: "ana@example.test",
  toName: "Ana",
  payload: { subject: "1 thing needs you today", body: "Follow up today:\n\n  - Aling Nena" },
  partnerId: "p1",
  attempts: 0,
  ...over,
});

const APP = "https://canvexia-two.vercel.app";

describe("rendering a queued row", () => {
  it("uses the copy the composer decided on the day", () => {
    // NOT re-derived here. The digest decided what to say when it ran; a
    // drainer that recomposed weeks later would send whatever this release
    // thinks rather than what was actually decided.
    const email = renderQueued(row(), APP)!;
    expect(email.to).toBe("ana@example.test");
    expect(email.subject).toBe("1 thing needs you today");
    expect(email.text).toContain("Aling Nena");
    expect(email.text).toContain("Hi Ana,");
  });

  it("greets without a name when there isn't one", () => {
    const email = renderQueued(row({ toName: null }), APP)!;
    expect(email.text).toContain("Hi,");
    expect(email.text).not.toContain("Hi null");
  });

  it("renders the welcome email, which carries facts rather than copy", () => {
    const email = renderQueued(
      row({
        template: "partner.welcome",
        payload: { partnerName: "Davao Operator", territory: "Davao City", revenueSharePct: 70 },
      }),
      APP,
    )!;
    expect(email.subject).toContain("Davao City");
    expect(email.text).toContain("70%");
    expect(email.text).toContain(`${APP}/partner/login`);
  });

  it("puts NO invite token in the welcome email", () => {
    // The payload deliberately never carried one — that was the point of
    // queueing without a token — and minting a fresh invite from a cron is not
    // a thing this codebase does.
    const email = renderQueued(
      row({ template: "partner.welcome", payload: { partnerName: "X" } }),
      APP,
    )!;
    expect(email.text).not.toMatch(/token|invite\/[A-Za-z0-9]/i);
  });

  it("SKIPS a template this release does not know, rather than failing it", () => {
    // A row queued by a later deploy is early, not broken. Marking it failed
    // would need somebody to un-fail it by hand once the deploy catches up.
    expect(renderQueued(row({ template: "partner.something.new", payload: {} }), APP)).toBeNull();
  });

  it("skips a row whose payload lost its copy", () => {
    expect(renderQueued(row({ payload: { subject: "Hi" } }), APP)).toBeNull();
    expect(renderQueued(row({ payload: null }), APP)).toBeNull();
  });
});

describe("the orderings that matter", () => {
  const src = readFileSync(join(process.cwd(), "src/server/email/outbox.ts"), "utf8");

  it("claims BEFORE sending, not after", () => {
    // If this flips, a crash between send and bookkeeping leaves the row
    // queued — and it resends on every tick until somebody notices. Resend's
    // batch endpoint takes no idempotency key, so a duplicate storm into a
    // partner's inbox is the failure this ordering prevents. A burnt attempt
    // is the cheaper mistake.
    const claim = src.indexOf("attempts: { increment: 1 }");
    const send = src.indexOf("await sendBatch(");
    expect(claim).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    expect(claim, "the claim must come before the send").toBeLessThan(send);
  });

  it("does nothing at all without credentials, and fails no rows", () => {
    // A deployment with no provider should accumulate a queue, not a pile of
    // permanently-failed rows somebody has to un-fail by hand.
    expect(src).toContain("if (!creds?.apiKey || !creds.fromEmail)");
    expect(src).toContain("configured: false");
  });

  it("requires a FROM address, not just a key", () => {
    // This is what holds sending off while canvexia.com is unverified: the key
    // is stored, the from-address is not, and the drainer is a no-op until it
    // is. Sending from an unverified domain would burn five attempts per row
    // and park the whole queue.
    expect(src).toContain("!creds.fromEmail");
  });

  it("parks a row after a bounded number of attempts", () => {
    // The failures that resolve themselves do so well inside five ticks; the
    // ones that do not are a bad address, which retrying cannot fix.
    expect(src).toContain("MAX_ATTEMPTS = 5");
    expect(src).toContain("attempts: { lt: MAX_ATTEMPTS }");
  });

  it("caps a tick at Resend's own batch limit", () => {
    expect(src).toContain("BATCH = 100");
  });
});

describe("the cron", () => {
  const route = readFileSync(
    join(process.cwd(), "src/app/api/cron/drain-emails/route.ts"),
    "utf8",
  );

  it("is guarded and recorded", () => {
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain('job: "drain-emails"');
  });

  it("records the run even when it was unconfigured", () => {
    // "No provider is set" and "the job stopped running" produced identical
    // evidence before cron_runs existed — the hole CRON_SECRET sat in for a
    // whole phase.
    const body = route.slice(route.indexOf("const result = await drainOutbox"));
    expect(body.indexOf("cronRun.create")).toBeGreaterThan(-1);
    expect(body).not.toContain("if (!result.configured) return");
  });

  it("is scheduled every 15 minutes", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const cron = vercel.crons.find((c) => c.path === "/api/cron/drain-emails");
    // A welcome email somebody is waiting on to get into their account should
    // not sit for an hour; that silence reads as "it did not work".
    expect(cron?.schedule).toBe("*/15 * * * *");
  });
});
