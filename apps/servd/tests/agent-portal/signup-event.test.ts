import { describe, it, expect } from "vitest";
import { productEventSchema } from "@servd/core/agent-kit";
import { queueSignupEvent } from "@/server/agent-portal/signup-event";

/**
 * Every path that creates a restaurant queues customer.signed_up through one
 * helper. Some of those paths (DIY activation, HQ accounts, converted demos)
 * never ask for an owner's name or phone — and the portal answers a blank one
 * with a permanent 422, which would leave that customer unable to pay. This
 * proves the helper's placeholders satisfy the contract.
 */
function captureTx() {
  const rows: { payload: unknown }[] = [];
  const tx = { productEventOutbox: { create: async ({ data }: { data: { payload: unknown } }) => rows.push(data) } };
  return { tx: tx as never, rows };
}

describe("queueSignupEvent", () => {
  it("produces a valid event even with no owner name, phone or code", async () => {
    const { tx, rows } = captureTx();
    await queueSignupEvent(tx, { restaurantId: "r-1", businessName: "Mango Grill", ownerPhone: "", ownerName: null });
    const parsed = productEventSchema.safeParse(rows[0].payload);
    expect(parsed.success).toBe(true);
    expect(rows[0].payload).toMatchObject({
      type: "customer.signed_up",
      data: { owner_name: "Owner of Mango Grill", owner_phone: "not given", agent_code: null },
    });
  });

  it("normalises the referral code the way the portal will read it", async () => {
    const { tx, rows } = captureTx();
    await queueSignupEvent(tx, { restaurantId: "r-2", businessName: "B", ownerName: "Ana", ownerPhone: "0917", agentCode: " abc-234 " });
    expect(rows[0].payload).toMatchObject({ data: { agent_code: "ABC234", owner_name: "Ana", owner_phone: "0917" } });
  });

  it("treats an old invite marker as no code", async () => {
    const { tx, rows } = captureTx();
    await queueSignupEvent(tx, { restaurantId: "r-3", businessName: "B", agentCode: "invite!" });
    expect(rows[0].payload).toMatchObject({ data: { agent_code: null } });
  });
});
