import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * STOP means STOP — everywhere, for everyone.
 *
 * THIS TEST IS WRITTEN BEFORE THE TWO-AXIS REFACTOR, on purpose. A person who
 * texts STOP has opted out of being marketed to, not out of one restaurant's
 * list, and the existing webhook says so in a comment. The refactor that adds a
 * partner axis is exactly the change that would quietly scope this by partner —
 * everything else in this codebase is scoped that way, so scoping it is the
 * natural mistake — and the consequence is a person who opted out still getting
 * texts from the same platform under a different brand.
 *
 * So the assertion is on the WHERE CLAUSE: a STOP must match on phone alone.
 */

const updateMany = vi.fn();
const send = vi.fn();
const parseInbound = vi.fn();

vi.mock("@/server/tenancy/scoped-db", () => ({
  systemDb: (fn: (tx: unknown) => unknown) =>
    fn({
      customerContact: { updateMany: (...a: unknown[]) => updateMany(...a) },
      smsContact: { updateMany: (...a: unknown[]) => updateMany(...a) },
    }),
}));

vi.mock("@/server/sms", () => ({
  getSmsProvider: () => ({
    send: (...a: unknown[]) => send(...a),
    parseInbound: (...a: unknown[]) => parseInbound(...a),
  }),
}));

async function post(body: unknown) {
  const { POST } = await import("@/app/api/webhooks/sms/route");
  const req = new Request("https://canvexia.com/api/webhooks/sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // The route's NextRequest type is structurally a Request here; the handler
  // only calls .json() and .formData().
  return POST(req as never);
}

beforeEach(() => {
  vi.resetModules();
  updateMany.mockReset();
  parseInbound.mockReset();
  updateMany.mockResolvedValue({ count: 0 });
});

describe("an inbound STOP", () => {
  it("opts the number out with no tenant in the where clause", async () => {
    parseInbound.mockReturnValue({ from: "09171234567", text: "STOP" });
    await post({ sender: "09171234567", message: "STOP" });

    expect(updateMany).toHaveBeenCalled();
    for (const call of updateMany.mock.calls) {
      const where = (call[0] as { where: Record<string, unknown> }).where;
      expect(where.phone).toBe("+639171234567");
      // The three ways this could be narrowed. Any of them turns "never
      // message me again" into "never message me again from this one brand".
      expect(where.restaurantId).toBeUndefined();
      expect(where.partnerId).toBeUndefined();
      expect(where.campaignId).toBeUndefined();
    }
  });

  it("normalises the number first, so the format they typed does not matter", async () => {
    parseInbound.mockReturnValue({ from: "+63 917 123 4567", text: "stop." });
    await post({});
    const where = (updateMany.mock.calls[0]?.[0] as { where: { phone: string } }).where;
    expect(where.phone).toBe("+639171234567");
  });

  it("marks the opt-out time, not just the state", async () => {
    // Without a timestamp there is no evidence of WHEN somebody opted out,
    // which is the thing a complaint turns on.
    parseInbound.mockReturnValue({ from: "09171234567", text: "STOP" });
    await post({});
    const data = (updateMany.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data.marketingConsent).toBe("opted_out");
    expect(data.optOutAt).toBeInstanceOf(Date);
  });
});

describe("an inbound YES", () => {
  it("confirms only PENDING contacts, and still across the platform", async () => {
    parseInbound.mockReturnValue({ from: "09171234567", text: "YES" });
    await post({});
    const arg = updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(arg.where.marketingConsent).toBe("pending");
    expect(arg.where.restaurantId).toBeUndefined();
    expect(arg.where.partnerId).toBeUndefined();
  });
});

describe("anything else", () => {
  it("changes nothing", async () => {
    parseInbound.mockReturnValue({ from: "09171234567", text: "what time do you open?" });
    const res = await post({});
    expect(updateMany).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("ignores an unreadable number rather than guessing", async () => {
    parseInbound.mockReturnValue({ from: "12345", text: "STOP" });
    await post({});
    expect(updateMany).not.toHaveBeenCalled();
  });
});
