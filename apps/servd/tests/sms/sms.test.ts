import { describe, it, expect } from "vitest";
import { classifyReply, normalizeMobile } from "@servd/core";

/**
 * `normalizeMobile`, not the old `normalizePhPhone`.
 *
 * A8.0's lift found TWO implementations of PH mobile normalisation: this one in
 * core, used by the waitlist and the pipeline, and a second under lib/sms used
 * by the SMS stack. Two normalisers mean one person can be two contacts, and a
 * duplicate check that never fires. The core one accepts everything the other
 * did and more (00 prefixes, parentheses, pasted non-breaking spaces), so the
 * duplicate is gone and these cases moved onto it.
 */

describe("normalizeMobile", () => {
  it("normalizes the common PH formats to E.164", () => {
    expect(normalizeMobile("09171234567")).toBe("+639171234567");
    expect(normalizeMobile("+639171234567")).toBe("+639171234567");
    expect(normalizeMobile("639171234567")).toBe("+639171234567");
    expect(normalizeMobile("0917 123 4567")).toBe("+639171234567");
    expect(normalizeMobile("0917-123-4567")).toBe("+639171234567");
  });
  it("rejects invalid numbers", () => {
    expect(normalizeMobile("12345")).toBeNull();
    expect(normalizeMobile("08171234567")).toBeNull(); // doesn't start with 9
    expect(normalizeMobile("+1 555 123 4567")).toBeNull();
  });
});

describe("classifyReply", () => {
  it("recognizes confirmations", () => {
    expect(classifyReply("YES")).toBe("confirm");
    expect(classifyReply("yes please")).toBe("confirm");
    expect(classifyReply("Oo")).toBe("confirm");
  });
  it("recognizes opt-outs", () => {
    expect(classifyReply("STOP")).toBe("stop");
    expect(classifyReply("stop.")).toBe("stop");
    expect(classifyReply("unsubscribe")).toBe("stop");
  });
  it("ignores anything else", () => {
    expect(classifyReply("what time do you open?")).toBe("other");
    expect(classifyReply("")).toBe("other");
  });
});
