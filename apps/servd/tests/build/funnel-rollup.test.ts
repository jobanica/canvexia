import { describe, it, expect } from "vitest";
import { rollupFunnel, totalFunnel, type FunnelEvents } from "@/lib/build/funnel-rollup";
import { manilaStartOfDaysAgo } from "@/lib/time/manila";

const NOW = new Date("2026-08-11T04:00:00Z"); // noon Manila

function row(p: Partial<FunnelEvents>): FunnelEvents {
  return {
    previewCreatedAt: null,
    previewReachedAt: null,
    activationRequestedAt: null,
    activatedAt: null,
    ...p,
  };
}

describe("rollupFunnel", () => {
  it("returns one bucket per day, oldest first", () => {
    const from = manilaStartOfDaysAgo(6, NOW);
    const days = rollupFunnel([], from, 7);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.day)).toEqual([...days.map((d) => d.day)].sort());
    expect(days.at(-1)!.day).toBe("2026-08-11");
  });

  it("counts each stage independently", () => {
    const from = manilaStartOfDaysAgo(6, NOW);
    const at = new Date("2026-08-11T02:00:00Z"); // 10 AM Manila
    const days = rollupFunnel(
      [
        row({ previewCreatedAt: at, previewReachedAt: at, activationRequestedAt: at, activatedAt: at }),
        row({ previewCreatedAt: at, previewReachedAt: at }),
        row({ previewCreatedAt: at }),
      ],
      from,
      7,
    );
    const today = days.find((d) => d.day === "2026-08-11")!;
    expect(today).toMatchObject({ started: 3, reachedPreview: 2, requested: 1, activated: 1 });
  });

  // The server runs in UTC; a 1 AM Manila build is still 5 PM UTC *yesterday*.
  // Bucketing on the raw UTC date would file it under the wrong day and make
  // the funnel look like it dipped overnight.
  it("files an early-morning Manila build under that Manila day", () => {
    const from = manilaStartOfDaysAgo(6, NOW);
    const oneAmManila = new Date("2026-08-10T17:00:00Z"); // 2026-08-11 01:00 +08
    const days = rollupFunnel([row({ previewCreatedAt: oneAmManila })], from, 7);
    expect(days.find((d) => d.day === "2026-08-11")!.started).toBe(1);
    expect(days.find((d) => d.day === "2026-08-10")!.started).toBe(0);
  });

  it("ignores events outside the window instead of miscounting them", () => {
    const from = manilaStartOfDaysAgo(2, NOW);
    const old = new Date("2026-01-01T00:00:00Z");
    const days = rollupFunnel([row({ previewCreatedAt: old })], from, 3);
    expect(totalFunnel(days).started).toBe(0);
  });

  it("totals every column across the window", () => {
    const from = manilaStartOfDaysAgo(2, NOW);
    const days = rollupFunnel(
      [
        row({ previewCreatedAt: new Date("2026-08-10T04:00:00Z"), activatedAt: new Date("2026-08-10T04:00:00Z") }),
        row({ previewCreatedAt: new Date("2026-08-11T04:00:00Z") }),
      ],
      from,
      3,
    );
    const t = totalFunnel(days);
    expect(t.started).toBe(2);
    expect(t.activated).toBe(1);
  });
});
