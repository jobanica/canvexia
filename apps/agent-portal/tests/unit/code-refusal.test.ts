import { describe, it, expect } from "vitest";
import { codeRefusal } from "@/server/events/ingest";

const s = { allow_self_referral: false };
const agent = (status: "pending" | "active" | "suspended" | "removed") => ({ status, mobile: "639171234567" });

describe("whether a reported code attaches", () => {
  it("attaches an active agent's code", () => {
    expect(codeRefusal(agent("active"), "09181112222", s)).toBeNull();
  });

  it("does not attach an unknown code or an inactive agent", () => {
    expect(codeRefusal(null, "0918", s)).toBe("unknown_code");
    expect(codeRefusal(agent("pending"), "0918", s)).toBe("agent_pending");
    expect(codeRefusal(agent("suspended"), "0918", s)).toBe("agent_suspended");
    expect(codeRefusal(agent("removed"), "0918", s)).toBe("agent_removed");
  });

  it("refuses self-referral by matching mobile, unless the setting allows it", () => {
    expect(codeRefusal(agent("active"), "0917 123 4567", s)).toBe("self_referral");
    expect(codeRefusal(agent("active"), "0917 123 4567", { allow_self_referral: true })).toBeNull();
  });
});
