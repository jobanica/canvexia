import { describe, it, expect } from "vitest";
import { normalizePhone, isValidPhone, phoneError } from "@/lib/phone";

describe("PH phone numbers", () => {
  it("accepts a plain 11-digit mobile", () => {
    expect(isValidPhone("09171234567")).toBe(true);
    expect(phoneError("09171234567")).toBeNull();
  });

  it("ignores spaces and dashes", () => {
    expect(isValidPhone("0917 123 4567")).toBe(true);
    expect(isValidPhone("0917-123-4567")).toBe(true);
  });

  it("normalises the +63 / 63 international form to 11 digits", () => {
    expect(normalizePhone("+639171234567")).toBe("09171234567");
    expect(normalizePhone("639171234567")).toBe("09171234567");
    expect(isValidPhone("+63 917 123 4567")).toBe(true);
  });

  it("rejects more than 11 digits", () => {
    expect(isValidPhone("091712345678")).toBe(false);
    expect(phoneError("091712345678")).toMatch(/too long/i);
  });

  it("rejects fewer than 11 digits", () => {
    expect(isValidPhone("0917123")).toBe(false);
    expect(phoneError("0917123")).toMatch(/should be 11/i);
  });

  it("rejects a number that doesn't start with 0", () => {
    expect(isValidPhone("91712345678")).toBe(false);
    expect(phoneError("91712345678")).toMatch(/start with 0/i);
  });

  it("stays quiet while the field is empty", () => {
    expect(phoneError("")).toBeNull();
    expect(phoneError("   ")).toBeNull();
  });
});
