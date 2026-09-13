import { describe, it, expect } from "vitest";
import { decideSend, type LeadState, type SendContext } from "@/lib/email/suppression";

/**
 * The rule this file exists to defend: a restaurant that has PAID never
 * receives another acquisition email, no matter what was scheduled for them
 * before they paid.
 */

const enabled = { enabled: true };

const preview: LeadState = {
  status: "preview",
  contactEmail: "owner@lolas.ph",
  emailOptOut: false,
  previewReachedAt: null,
};

const ctx = (over: Partial<SendContext> = {}): SendContext => ({
  template: enabled,
  lead: preview,
  configured: true,
  ...over,
});

const stepA = { track: "A", stepKey: "A_day1" };
const stepB = { track: "B", stepKey: "B_day3" };

describe("the happy path", () => {
  it("sends a Track A step to an un-activated lead who never reached a preview", () => {
    expect(decideSend(stepA, ctx())).toEqual({ send: true });
  });

  it("sends a Track B step to someone who reached a preview and hasn't paid", () => {
    expect(
      decideSend(stepB, ctx({ lead: { ...preview, previewReachedAt: new Date() } })),
    ).toEqual({ send: true });
  });
});

describe("activation suppression", () => {
  // The one that matters. A step scheduled a week ago is evaluated against who
  // this person is today, and today they are a customer.
  it("never emails a lead who has activated", () => {
    for (const step of [stepA, stepB]) {
      expect(decideSend(step, ctx({ lead: { ...preview, status: "active" } }))).toEqual({
        send: false,
        skip: "activated",
      });
    }
  });

  // Anything that isn't still a preview is off-limits, including states that
  // don't exist yet — the check is a whitelist for exactly this reason.
  it("treats any non-preview status as off-limits, not just 'active'", () => {
    for (const status of ["active", "archived", "suspended", "something_new"]) {
      expect(decideSend(stepB, ctx({ lead: { ...preview, status } }))).toEqual({
        send: false,
        skip: "activated",
      });
    }
  });

  // Ordering check: a paying customer who also happens to have opted out, or
  // to have no address, must still be recorded as `activated` — otherwise the
  // measurement quietly under-counts the rule that matters most.
  it("reports 'activated' ahead of any other reason", () => {
    const paidAndOptedOut = {
      ...preview,
      status: "active",
      emailOptOut: true,
      previewReachedAt: new Date(),
      contactEmail: null,
    };
    expect(decideSend(stepA, ctx({ lead: paidAndOptedOut }))).toEqual({
      send: false,
      skip: "activated",
    });
  });
});

describe("the rest of the suppression list", () => {
  it("stops when the lead has unsubscribed", () => {
    expect(decideSend(stepB, ctx({ lead: { ...preview, emailOptOut: true } }))).toEqual({
      send: false,
      skip: "unsubscribed",
    });
  });

  // They've already done what Track A was asking for. Track B carries them now.
  it("drops a Track A step once they've reached a preview", () => {
    expect(
      decideSend(stepA, ctx({ lead: { ...preview, previewReachedAt: new Date() } })),
    ).toEqual({ send: false, skip: "moved_to_B" });
  });

  it("does NOT drop a Track B step for reaching a preview — that's what B is for", () => {
    expect(
      decideSend(stepB, ctx({ lead: { ...preview, previewReachedAt: new Date() } })),
    ).toEqual({ send: true });
  });

  it("stops when the step is paused in super-admin", () => {
    expect(decideSend(stepA, ctx({ template: { enabled: false } }))).toEqual({
      send: false,
      skip: "disabled",
    });
    expect(decideSend(stepA, ctx({ template: null }))).toEqual({
      send: false,
      skip: "disabled",
    });
  });

  it("stops when the lead row is gone", () => {
    expect(decideSend(stepA, ctx({ lead: null }))).toEqual({ send: false, skip: "lead_gone" });
  });

  it("stops when there is no address to send to", () => {
    for (const contactEmail of [null, "", "   "]) {
      expect(decideSend(stepA, ctx({ lead: { ...preview, contactEmail } }))).toEqual({
        send: false,
        skip: "no_email",
      });
    }
  });
});

describe("an unconfigured provider", () => {
  // DEFER, not skip. Skipping would silently burn a lead's entire sequence
  // during the window before the founder pastes in an API key — the steps
  // would all come due, all be marked done, and none would ever be sent.
  it("defers rather than burning the step", () => {
    const decision = decideSend(stepA, ctx({ configured: false }));
    expect(decision).toEqual({ send: false, defer: true });
    expect(decision).not.toHaveProperty("skip");
  });

  // But a lead who has paid is still suppressed permanently — "we couldn't
  // send it yet" must never resurrect an email for a customer.
  it("still suppresses an activated lead permanently", () => {
    expect(
      decideSend(stepA, ctx({ configured: false, lead: { ...preview, status: "active" } })),
    ).toEqual({ send: false, skip: "activated" });
  });
});
