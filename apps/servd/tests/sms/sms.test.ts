import { describe, it, expect } from "vitest";
import { normalizePhPhone } from "@/lib/sms/phone";
import { classifyReply } from "@/lib/sms/keywords";

describe("normalizePhPhone", () => {
  it("normalizes the common PH formats to E.164", () => {
    expect(normalizePhPhone("09171234567")).toBe("+639171234567");
    expect(normalizePhPhone("+639171234567")).toBe("+639171234567");
    expect(normalizePhPhone("639171234567")).toBe("+639171234567");
    expect(normalizePhPhone("0917 123 4567")).toBe("+639171234567");
    expect(normalizePhPhone("0917-123-4567")).toBe("+639171234567");
  });
  it("rejects invalid numbers", () => {
    expect(normalizePhPhone("12345")).toBeNull();
    expect(normalizePhPhone("08171234567")).toBeNull(); // doesn't start with 9
    expect(normalizePhPhone("+1 555 123 4567")).toBeNull();
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
