import { describe, it, expect } from "vitest";
import { planReassignment, REASSIGNABLE_TO_STATUS } from "@/lib/partners/reassign";

/**
 * Territory is licensed, not owned. A partner who stops supporting their city
 * has to be replaceable without the merchants they signed being stranded, and
 * that is only true if moving one is a column change with rules around it.
 */
describe("merchant reassignment", () => {
  const APPROVED = REASSIGNABLE_TO_STATUS;

  it("moves a merchant between two approved partners", () => {
    expect(
      planReassignment({
        currentPartnerId: "partner-a",
        targetPartnerId: "partner-b",
        targetPartnerStatus: APPROVED,
      }),
    ).toEqual({ action: "move", from: "partner-a", to: "partner-b" });
  });

  it("assigns a merchant that had no partner at all", () => {
    // The state the house-partner backfill exists to clear. It is still a valid
    // move, and `from: null` is what the audit row records.
    expect(
      planReassignment({
        currentPartnerId: null,
        targetPartnerId: "partner-b",
        targetPartnerStatus: APPROVED,
      }),
    ).toEqual({ action: "move", from: null, to: "partner-b" });
  });

  it("is a no-op, not an error, when the merchant is already there", () => {
    // Double-submits and re-run bulk moves both land here and both are fine.
    const d = planReassignment({
      currentPartnerId: "partner-a",
      targetPartnerId: "partner-a",
      targetPartnerStatus: APPROVED,
    });
    expect(d.action).toBe("noop");
  });

  it("refuses a partner that does not exist", () => {
    const d = planReassignment({
      currentPartnerId: "partner-a",
      targetPartnerId: "ghost",
      targetPartnerStatus: null,
    });
    expect(d.action).toBe("reject");
    if (d.action === "reject") expect(d.error).toMatch(/no longer exists/);
  });

  it.each(["pending", "suspended", "rejected"])(
    "refuses a %s partner — they could not sign in to support the merchant",
    (status) => {
      const d = planReassignment({
        currentPartnerId: "partner-a",
        targetPartnerId: "partner-b",
        targetPartnerStatus: status,
      });
      expect(d.action).toBe("reject");
      if (d.action === "reject") expect(d.error).toContain(status);
    },
  );

  it("refuses an empty target rather than unassigning the merchant", () => {
    // Clearing partnerId would make the merchant invisible to every partner
    // scope and absent from every statement. If that is ever wanted it needs to
    // be its own deliberate action, not a blank field in this one.
    const d = planReassignment({
      currentPartnerId: "partner-a",
      targetPartnerId: "",
      targetPartnerStatus: null,
    });
    expect(d.action).toBe("reject");
    if (d.action === "reject") expect(d.error).toMatch(/Choose a partner/);
  });
});
