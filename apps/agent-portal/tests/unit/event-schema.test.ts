import { describe, it, expect } from "vitest";
import { productEventSchema } from "@servd/core/agent-kit";

const base = { event_id: "evt_00000001", occurred_at: "2026-10-06T04:00:00.000Z" };

describe("product event contract", () => {
  it("accepts a signup with and without a code", () => {
    const data = { external_customer_id: "r1", business_name: "Mango Grill", owner_name: "Ana", owner_phone: "09171234567" };
    expect(productEventSchema.safeParse({ ...base, type: "customer.signed_up", data }).success).toBe(true);
    expect(productEventSchema.safeParse({ ...base, type: "customer.signed_up", data: { ...data, agent_code: "ABC234", plan: "basic" } }).success).toBe(true);
  });

  it("requires billing_month_start on a monthly payment", () => {
    const data = { external_customer_id: "r1", type: "monthly", months_covered: 1, amount: 80000, bank_reference: "BPI-123" };
    expect(productEventSchema.safeParse({ ...base, type: "payment.submitted", data }).success).toBe(false);
    expect(productEventSchema.safeParse({ ...base, type: "payment.submitted", data: { ...data, billing_month_start: "2026-10" } }).success).toBe(true);
  });

  it("refuses an activation covering more than one month", () => {
    const data = { external_customer_id: "r1", type: "activation", months_covered: 2, amount: 50000, bank_reference: "BPI-1" };
    expect(productEventSchema.safeParse({ ...base, type: "payment.submitted", data }).success).toBe(false);
  });

  it("refuses money that is not whole centavos", () => {
    const data = { external_customer_id: "r1", type: "activation", months_covered: 1, amount: 500.5, bank_reference: "BPI-1" };
    expect(productEventSchema.safeParse({ ...base, type: "payment.submitted", data }).success).toBe(false);
  });

  it("refuses an unknown event type", () => {
    expect(productEventSchema.safeParse({ ...base, type: "customer.deleted", data: {} }).success).toBe(false);
  });

  it("refuses a malformed month", () => {
    const data = { external_customer_id: "r1", type: "monthly", months_covered: 1, amount: 80000, bank_reference: "BPI-1", billing_month_start: "2026-13" };
    expect(productEventSchema.safeParse({ ...base, type: "payment.submitted", data }).success).toBe(false);
  });
});
