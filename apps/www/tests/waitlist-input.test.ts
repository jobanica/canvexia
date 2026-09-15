import { describe, it, expect } from "vitest";
import {
  WaitlistInput,
  normalizeMobile,
  firstMessage,
  HOURS_VALUES,
  HOURS_OPTIONS,
} from "@/lib/waitlist-input";

/**
 * The waitlist form's schema.
 *
 * The mobile block is the long one on purpose: a number that arrives in four
 * spellings is four rows that look like four people, and HQ rings these.
 */

const valid = {
  fullName: "  Maria Santos ",
  email: "maria@example.com",
  mobile: "0917 123 4567",
  city: "Tagum",
  province: "Davao del Norte",
  currentWork: "Sari-sari store",
  hoursPerWeek: "h10to20",
  soldBefore: "yes",
  soldWhat: "Load and prepaid cards",
  howHeard: "Facebook",
};

describe("normalizeMobile", () => {
  it("stores every spelling of one number the same way", () => {
    for (const spelling of [
      "09171234567",
      "0917 123 4567",
      "0917-123-4567",
      "(0917) 123.4567",
      "+639171234567",
      "+63 917 123 4567",
      "639171234567",
      "9171234567",
      "00639171234567",
    ]) {
      expect(normalizeMobile(spelling), spelling).toBe("+639171234567");
    }
  });

  it("survives a number pasted out of a chat app", () => {
    // U+00A0. Looks like a space, is not one, and a naive \s-free strip leaves
    // it in the digits.
    expect(normalizeMobile("0917 123 4567")).toBe("+639171234567");
  });

  it("refuses a landline, because the programme runs on SMS", () => {
    expect(normalizeMobile("082 224 1234")).toBeNull();
    expect(normalizeMobile("(02) 8888 1234")).toBeNull();
  });

  it("refuses a number of the wrong length", () => {
    expect(normalizeMobile("0917 123 456")).toBeNull();
    expect(normalizeMobile("0917 123 45678")).toBeNull();
  });

  it("refuses letters, and an empty string", () => {
    expect(normalizeMobile("call me")).toBeNull();
    expect(normalizeMobile("0917-123-456A")).toBeNull();
    expect(normalizeMobile("")).toBeNull();
  });
});

describe("WaitlistInput", () => {
  it("accepts a filled form and trims what it stores", () => {
    const r = WaitlistInput.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.fullName).toBe("Maria Santos");
    expect(r.data.mobile).toBe("+639171234567");
    expect(r.data.soldBefore).toBe(true);
  });

  it("accepts a form with every optional box left blank", () => {
    const r = WaitlistInput.safeParse({
      fullName: "Jun Cruz",
      email: "jun@example.com",
      mobile: "09181234567",
      city: "Mati",
      province: "",
      currentWork: "",
      hoursPerWeek: "under5",
      soldBefore: "no",
      soldWhat: "",
      howHeard: "",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    // null, not "": an empty box means "not answered", and "" in the column
    // reads as an answer given.
    expect(r.data.province).toBeNull();
    expect(r.data.soldWhat).toBeNull();
    expect(r.data.soldBefore).toBe(false);
  });

  it("reads an explicit no, including the string 'false'", () => {
    for (const v of ["no", "false", "0", false] as const) {
      const r = WaitlistInput.safeParse({ ...valid, soldBefore: v });
      expect(r.success, String(v)).toBe(true);
      if (r.success) expect(r.data.soldBefore, String(v)).toBe(false);
    }
  });

  it("refuses an UNANSWERED sold-before rather than recording 'no'", () => {
    // An untouched radio pair submits nothing. Casting that to false writes a
    // wrong answer about a stranger into a column nobody will ever re-check.
    for (const v of [undefined, null, "", "maybe"]) {
      const r = WaitlistInput.safeParse({ ...valid, soldBefore: v });
      expect(r.success, String(v)).toBe(false);
      if (!r.success) expect(firstMessage(r.error)).toMatch(/sold something before/i);
    }
  });

  for (const [field, message] of [
    ["fullName", "Enter your full name."],
    ["city", "Which city do you want to run?"],
  ] as const) {
    it(`refuses a blank ${field} with a message a person can act on`, () => {
      const r = WaitlistInput.safeParse({ ...valid, [field]: "   " });
      expect(r.success).toBe(false);
      if (r.success) return;
      expect(firstMessage(r.error)).toBe(message);
    });
  }

  it("refuses an email that cannot receive a reply", () => {
    const r = WaitlistInput.safeParse({ ...valid, email: "maria@" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstMessage(r.error)).toMatch(/email address/i);
  });

  it("refuses an hours answer that is not one of the four", () => {
    const r = WaitlistInput.safeParse({ ...valid, hoursPerWeek: "40" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstMessage(r.error)).toMatch(/hours a week/i);
  });

  it("caps a field somebody pastes a novel into", () => {
    const r = WaitlistInput.safeParse({ ...valid, currentWork: "x".repeat(5000) });
    expect(r.success).toBe(false);
  });

  it("never shows zod's own generic wording", () => {
    const r = WaitlistInput.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) expect(firstMessage(r.error)).not.toMatch(/^(Required|Invalid|Expected)/);
  });
});

describe("hours options", () => {
  it("offers exactly the values the schema accepts", () => {
    expect(HOURS_OPTIONS.map((o) => o.value)).toEqual([...HOURS_VALUES]);
  });

  it("uses Prisma's enum names, not the labels Postgres stores", () => {
    // `under5 @map("<5")`: the column holds '<5', the client only ever says
    // `under5`, and posting the mapped spelling is rejected before it reaches
    // the database. The two look interchangeable and are not.
    for (const mapped of ["<5", "5-10", "10-20", "20+"]) {
      expect(HOURS_VALUES).not.toContain(mapped);
      expect(WaitlistInput.safeParse({ ...valid, hoursPerWeek: mapped }).success).toBe(false);
    }
  });
});
