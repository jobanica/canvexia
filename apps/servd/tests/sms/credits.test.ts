import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CREDIT_PACKS,
  CREDIT_PRICE_CENTAVOS,
  campaignCost,
  countSegments,
  encodingOf,
  isLow,
  lowBalanceThreshold,
  packFor,
  pesos,
  providerCostLine,
} from "@servd/core";

/**
 * Credits, which is where an SMS product meets somebody's money.
 *
 * The segment count is the part worth testing hardest: it decides what a
 * composer promises, what a wallet is debited, and what the aggregator's
 * invoice is reconciled against. Those three disagreeing is a support ticket
 * every month forever.
 */

describe("segments", () => {
  it("is zero for an empty message, not one", () => {
    // The composer shows a cost before anything is typed. "1 credit" for
    // nothing is wrong in the direction that costs somebody money.
    expect(countSegments("").segments).toBe(0);
  });

  it("counts a plain message at 160 characters", () => {
    expect(countSegments("x".repeat(160)).segments).toBe(1);
    expect(countSegments("x".repeat(161)).segments).toBe(2);
    // 153, not 160, once concatenated: the header eats seven characters.
    expect(countSegments("x".repeat(306)).segments).toBe(2);
    expect(countSegments("x".repeat(307)).segments).toBe(3);
  });

  it("drops to 70 characters the moment one character is not GSM-7", () => {
    // ONE EMOJI QUADRUPLES THE BILL. A curly apostrophe pasted out of Word does
    // the same thing, silently, which is why the composer has to say so.
    expect(encodingOf("Sale today")).toBe("GSM-7");
    expect(encodingOf("Sale today 🎉")).toBe("UCS-2");
    expect(encodingOf("Don’t miss it")).toBe("UCS-2"); // curly apostrophe
    expect(countSegments("x".repeat(70) + "🎉").segments).toBeGreaterThan(1);
    expect(countSegments("x".repeat(70)).segments).toBe(1);
  });

  it("counts the escaped GSM-7 characters twice, as the network does", () => {
    // { } [ ] ~ ^ \ | € are escape sequences: two characters on the wire.
    expect(countSegments("{").length).toBe(2);
    expect(countSegments("x".repeat(159) + "{").segments).toBe(2);
  });

  it("treats the peso sign as what it is", () => {
    // ₱ is NOT in GSM-7 — the € is, the ₱ is not — so a price in a Philippine
    // marketing text costs 70-character segments. Worth knowing before a
    // campaign, not after.
    expect(encodingOf("₱99 today")).toBe("UCS-2");
  });

  it("multiplies by recipients", () => {
    expect(campaignCost("x".repeat(161), 100)).toBe(200);
    expect(campaignCost("short", 0)).toBe(0);
  });
});

describe("the packs", () => {
  it("prices every pack from one number", () => {
    expect(CREDIT_PRICE_CENTAVOS).toBe(50);
    for (const pack of CREDIT_PACKS) {
      expect(pack.priceCentavos).toBe(pack.credits * CREDIT_PRICE_CENTAVOS);
    }
    expect(CREDIT_PACKS.map((p) => p.credits)).toEqual([500, 2000, 10000]);
  });

  it("refuses an amount that is not a pack", () => {
    // Otherwise a crafted POST buys 1 credit, or 10 million.
    expect(packFor(500)).not.toBeNull();
    expect(packFor(501)).toBeNull();
    expect(packFor(0)).toBeNull();
    expect(packFor(-500)).toBeNull();
  });

  it("formats pesos the way a Filipino reader expects", () => {
    expect(pesos(25000)).toBe("₱250.00");
  });
});

describe("the low-balance warning", () => {
  it("is ten per cent of the LAST TOP-UP, not of the balance", () => {
    // Ten per cent of the balance is a threshold that moves as the balance
    // moves and can never be crossed.
    expect(lowBalanceThreshold(2000)).toBe(200);
    expect(isLow(199, 2000)).toBe(true);
    expect(isLow(500, 2000)).toBe(false);
  });

  it("has a floor, for somebody who has never topped up", () => {
    // A warning at 5 credits arrives after the campaign has already been cut
    // short.
    expect(lowBalanceThreshold(0)).toBe(50);
    expect(lowBalanceThreshold(100)).toBe(50);
  });
});

describe("the statement's pass-through line", () => {
  it("says the cost is not configured rather than inventing one", () => {
    // THE RULE THIS WHOLE FUNCTION EXISTS FOR. The aggregator's per-segment
    // price is not in this repository. A guess here becomes a made-up margin on
    // a document an operator uses to decide whether this business is worth
    // running.
    const line = providerCostLine(1000, null);
    expect(line.configured).toBe(false);
    expect(line.centavos).toBeNull();
    expect(line.text).toMatch(/not configured/i);
    expect(line.text).not.toMatch(/₱\d/);
    expect(providerCostLine(1000, undefined).configured).toBe(false);
  });

  it("computes it once somebody enters the real figure", () => {
    const line = providerCostLine(1000, 35);
    expect(line.configured).toBe(true);
    expect(line.centavos).toBe(35000);
    expect(line.text).toContain("₱0.35");
  });
});

/**
 * Three money rules that only the server holds.
 */
const SRC = join(__dirname, "../../src");
const codeOf = (p: string) =>
  readFileSync(join(SRC, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("what must stay true about the wallet", () => {
  it("debits with a conditional update, not a check-then-write", () => {
    // Two campaigns started in the same second must not both pass a balance
    // check and leave the wallet negative.
    const code = codeOf("server/partners/sms-wallet.ts");
    const debit = code.slice(code.indexOf("export async function debit"), code.indexOf("export async function refund"));
    expect(debit).toContain("balanceCredits: { gte: credits }");
    expect(debit).toContain("decrement: credits");
  });

  it("creates credits in exactly one place, idempotently", () => {
    const code = codeOf("server/partners/sms-wallet.ts");
    // The claim is what makes a repeated webhook delivery a no-op.
    const credit = code.slice(code.indexOf("export async function creditTopUp"));
    expect(credit).toContain('where: { id: topUpId, status: "pending" }');
    expect(credit).toContain("if (claimed.count === 0) return false");
  });

  it("refuses to settle a credit purchase from a partner's own gateway", () => {
    // Credits are sold by CANVEXIA for CANVEXIA's money. A partner settling one
    // from their own endpoint would be crediting their wallet with a payment
    // that landed in their account.
    const code = codeOf("server/partners/sms-topup.ts");
    expect(code).toContain('scope.kind !== "platform"');
  });

  it("reads an unreadable wallet as empty, which blocks sending", () => {
    const code = codeOf("server/partners/sms-wallet.ts");
    const fallback = code.slice(code.indexOf("export async function getWallet"));
    expect(fallback).toContain("balance: 0");
  });
});
