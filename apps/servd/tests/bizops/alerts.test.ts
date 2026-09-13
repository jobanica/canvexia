import { describe, it, expect } from "vitest";
import { buildAlerts, type AlertInput } from "@/lib/bizops/alerts";

const quiet: AlertInput = {
  followUpsDue: 0,
  neverChased: 0,
  atCap: 0,
  nearCap: 0,
  warmPreviews: 0,
  dormant: 0,
  activations: 0,
  hasAdSpend: true,
};

describe("buildAlerts", () => {
  it("says so plainly when there's nothing to do", () => {
    const out = buildAlerts(quiet);
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe("good");
  });

  it("ranks a shop at its cap above an unchased lead", () => {
    // The cap is a paying customer losing money right now; the lead is a maybe.
    const out = buildAlerts({ ...quiet, atCap: 1, neverChased: 5 });
    expect(out[0].title).toContain("at the order cap");
    expect(out[1].title).toContain("never been followed up");
  });

  it("doesn't double-count the never-chased inside the due total", () => {
    // 10 due, 4 of them never chased → one alert for 4, one for the other 6.
    const out = buildAlerts({ ...quiet, followUpsDue: 10, neverChased: 4 });
    expect(out.find((a) => a.title.includes("never been"))?.title).toContain("4");
    expect(out.find((a) => a.title.includes("follow-up"))?.title).toContain("6");
  });

  it("raises no 'due' alert when every due lead is a never-chased one", () => {
    const out = buildAlerts({ ...quiet, followUpsDue: 4, neverChased: 4 });
    expect(out.filter((a) => a.title.includes("follow-up"))).toHaveLength(0);
  });

  it("gets the singular right", () => {
    expect(buildAlerts({ ...quiet, atCap: 1 })[0].title).toContain("restaurant is");
    expect(buildAlerts({ ...quiet, atCap: 2 })[0].title).toContain("restaurants are");
    expect(buildAlerts({ ...quiet, followUpsDue: 1 })[0].title).toBe("1 follow-up due");
  });

  it("nags about missing ad spend, because the blank CAC is otherwise unexplained", () => {
    const out = buildAlerts({ ...quiet, hasAdSpend: false });
    expect(out.some((a) => a.title.includes("ad spend"))).toBe(true);
  });

  it("mentions the wins when there's nothing wrong", () => {
    const out = buildAlerts({ ...quiet, activations: 3 });
    expect(out[0].detail).toContain("3 activations");
  });

  it("gives every alert somewhere to go, except the all-clear", () => {
    const out = buildAlerts({ ...quiet, atCap: 1, dormant: 2, followUpsDue: 3, hasAdSpend: false });
    for (const a of out) expect(a.href).toBeTruthy();
    expect(buildAlerts(quiet)[0].href).toBeUndefined();
  });
});
