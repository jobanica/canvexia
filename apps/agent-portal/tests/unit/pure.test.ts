import { describe, it, expect } from "vitest";
import { CODE_ALPHABET, generateReferralCode, normalizeReferralCode } from "@/lib/referral-code";
import { normalizePhone, samePhone } from "@/lib/phone";
import { actionsFor, agentTransition, codeAttaches } from "@/lib/agent-status";
import { parsePesos, peso } from "@/lib/money";
import { referralLink } from "@/lib/referral-link";
import { parseApplication } from "@/lib/application";

describe("referral codes", () => {
  it("are six characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateReferralCode();
      expect(c).toMatch(/^[A-Z0-9]{6}$/);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it("normalise what a person types", () => {
    expect(normalizeReferralCode(" abc-234 ")).toBe("ABC234");
    expect(normalizeReferralCode("abc 234")).toBe("ABC234");
  });

  it("read an old invite marker or junk as no code", () => {
    expect(normalizeReferralCode("")).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
    expect(normalizeReferralCode("x")).toBeNull();
    expect(normalizeReferralCode("hello%20world!")).toBeNull();
  });
});

describe("phone numbers", () => {
  it("compare equal across the ways people write them", () => {
    expect(normalizePhone("0917 123 4567")).toBe("639171234567");
    expect(normalizePhone("+63 917-123-4567")).toBe("639171234567");
    expect(normalizePhone("9171234567")).toBe("639171234567");
    expect(samePhone("09171234567", "+639171234567")).toBe(true);
    expect(samePhone("09171234567", "09181234567")).toBe(false);
    expect(samePhone("", "")).toBe(false);
  });
});

describe("agent status", () => {
  it("follows the allowed transitions", () => {
    expect(agentTransition("pending", "approve")).toEqual({ ok: true, to: "active" });
    expect(agentTransition("pending", "reject")).toEqual({ ok: true, to: "removed" });
    expect(agentTransition("active", "suspend")).toEqual({ ok: true, to: "suspended" });
    expect(agentTransition("suspended", "reinstate")).toEqual({ ok: true, to: "active" });
    expect(agentTransition("suspended", "remove")).toEqual({ ok: true, to: "removed" });
  });

  it("refuses the rest — removed is terminal", () => {
    expect(agentTransition("active", "approve").ok).toBe(false);
    expect(agentTransition("removed", "reinstate").ok).toBe(false);
    expect(agentTransition("pending", "suspend").ok).toBe(false);
    expect(actionsFor("removed")).toEqual([]);
    expect(actionsFor("pending")).toEqual(["approve", "reject"]);
  });

  it("only an active agent's code attaches", () => {
    expect(codeAttaches("active")).toBe(true);
    for (const s of ["pending", "suspended", "removed"] as const) expect(codeAttaches(s)).toBe(false);
  });
});

describe("money", () => {
  it("formats and parses centavos", () => {
    expect(peso(50000)).toBe("₱500.00");
    expect(peso(-20000)).toBe("-₱200.00");
    expect(parsePesos("1,234.5")).toBe(123450);
    expect(parsePesos("₱800")).toBe(80000);
    expect(parsePesos("12.345")).toBeNull();
    expect(parsePesos("-5")).toBeNull();
  });
});

describe("referral links", () => {
  it("add ?ref= and replace an existing one", () => {
    expect(referralLink("https://www.servdph.net/signup", "ABC234")).toBe("https://www.servdph.net/signup?ref=ABC234");
    expect(referralLink("https://x.test/s?utm=a&ref=OLD", "ABC234")).toBe("https://x.test/s?utm=a&ref=ABC234");
  });
});

describe("agent application", () => {
  const good = {
    name: "Juan Dela Cruz",
    mobile: "0917 123 4567",
    payoutMethod: "GCash",
    payoutAccountName: "Juan Dela Cruz",
    payoutAccountNumber: "0917 123 4567",
    agreementVersion: "1",
    accept: "on",
  };

  it("parses and normalises a good application", () => {
    const r = parseApplication(good);
    expect(r.ok && r.input).toEqual({
      name: "Juan Dela Cruz",
      mobile: "639171234567",
      payoutMethod: "GCash",
      payoutAccountName: "Juan Dela Cruz",
      payoutAccountNumber: "09171234567",
    });
  });

  it("requires the agreement to be accepted", () => {
    expect(parseApplication({ ...good, accept: undefined }).ok).toBe(false);
  });

  it("requires a PH mobile", () => {
    expect(parseApplication({ ...good, mobile: "12345" }).ok).toBe(false);
  });

  it("requires a bank name for bank transfer", () => {
    expect(parseApplication({ ...good, payoutMethod: "Bank" }).ok).toBe(false);
    const r = parseApplication({ ...good, payoutMethod: "Bank", bankName: "BPI" });
    expect(r.ok && r.input.payoutMethod).toBe("Bank: BPI");
  });
});
