import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { lastSevenDays, manilaDayKey, manilaDayRange } from "@/server/partners/attendance";

/**
 * A7.4: the Manila day, and the four promises the field app makes.
 *
 * The date arithmetic is what this file mostly exists for. Vercel Cron is UTC
 * and Manila is UTC+8, so "today" derived from an instant is the wrong day for
 * eight hours out of every twenty-four — the same trap that once put the
 * statement freeze a month out of place, and the one that would silently give
 * somebody two check-ins on one working day.
 */

describe("the Manila day", () => {
  it("is the same key from 00:01 to 23:59 local, whatever UTC says", () => {
    // 16:00 UTC is midnight in Manila. These four instants are one Manila day.
    const sameDay = [
      "2026-09-14T16:00:00Z", // 00:00 on the 15th, Manila
      "2026-09-14T20:00:00Z", // 04:00
      "2026-09-15T08:00:00Z", // 16:00
      "2026-09-15T15:59:00Z", // 23:59
    ].map((s) => manilaDayKey(new Date(s)));
    expect(new Set(sameDay).size, sameDay.join(" ")).toBe(1);
    expect(sameDay[0]).toBe("2026-09-15");
  });

  it("rolls at 16:00 UTC, not at midnight UTC", () => {
    // THE BUG THIS EXISTS FOR. A naive toISOString().slice(0,10) would roll
    // eight hours late, so a check-in at 8am Manila would land on yesterday.
    expect(manilaDayKey(new Date("2026-09-15T15:59:59Z"))).toBe("2026-09-15");
    expect(manilaDayKey(new Date("2026-09-15T16:00:00Z"))).toBe("2026-09-16");
  });

  it("bounds a day with exactly 24 hours, starting at 16:00 UTC the day before", () => {
    const { from, to } = manilaDayRange("2026-09-15");
    expect(from.toISOString()).toBe("2026-09-14T16:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-15T16:00:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(86_400_000);
  });

  it("crosses a month boundary", () => {
    const { from } = manilaDayRange("2026-10-01");
    expect(from.toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("returns seven consecutive days, oldest first, ending today", () => {
    const days = lastSevenDays(new Date("2026-09-15T08:00:00Z"));
    expect(days).toEqual([
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]);
  });
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("privacy: location is read on an action, never in the background", () => {
  const app = code("src/components/partner/FieldApp.tsx");

  it("never watches position", () => {
    // watchPosition is background tracking by another name, and the brief says
    // no. A permission prompt on open — for a page somebody only meant to read
    // — is also what makes people uninstall an app like this.
    expect(app).not.toContain("watchPosition");
  });

  it("only calls getCurrentPosition from inside the submit path", () => {
    expect(app).toContain("getCurrentPosition");
    // Not from an effect. If this ever moves into useEffect, the app starts
    // asking for location the moment it opens.
    const effects = app.split("useEffect(");
    for (const chunk of effects.slice(1)) {
      const body = chunk.slice(0, chunk.indexOf("}, ["));
      expect(body, "geolocation moved into an effect").not.toContain("geolocation");
    }
  });

  it("says so on screen, on both the field app and the manager view", () => {
    expect(read("src/components/partner/FieldApp.tsx")).toContain(
      "Nothing is tracked in the background",
    );
    expect(
      read("src/app/(platform)/partner/attendance/manager/page.tsx"),
    ).toContain("Nothing is tracked in between");
  });
});

describe("the offline queue", () => {
  const queue = code("src/lib/partners/visit-queue.ts");

  it("mints the idempotency key before anything is sent", () => {
    // The server's uniqueness constraint is what makes a replay a no-op; this
    // is the other half of it.
    expect(queue).toContain("newClientRef");
    expect(queue).toContain("clientRef");
  });

  it("posts to a stable URL, not a server action id", () => {
    // An action id is a build artefact. An item queued yesterday must still be
    // sendable after today's deploy.
    expect(queue).toContain('"/api/partner/field/sync"');
    expect(existsSync(join(process.cwd(), "src/app/api/partner/field/sync/route.ts"))).toBe(
      true,
    );
  });

  it("stops the drain on the first failure, preserving order", () => {
    // Items go in the order they happened — a check-in before that day's
    // visits — and pushing past a failure would reorder them.
    expect(queue).toContain("break;");
  });

  it("does not queue photos", () => {
    // A few megabytes of base64 per item fills a phone's quota in an afternoon,
    // and the queue then silently stops accepting the thing it exists for.
    expect(queue).not.toContain("photo");
  });

  it("uses its own store, not the kitchen's outbox", () => {
    // Two producers on one store is how a queue starts dropping other people's
    // items.
    expect(queue).toContain('"canvexia-field"');
    expect(queue).not.toContain("servd-offline");
  });
});

describe("the sync route", () => {
  const route = code("src/app/api/partner/field/sync/route.ts");

  it("delegates to the same actions the online path uses", () => {
    // A second copy of "may this seat check in" here is a second copy to get
    // wrong.
    for (const fn of ["checkInAction", "checkOutAction", "logVisitAction"]) {
      expect(route, fn).toContain(fn);
    }
  });

  it("answers 200 for a refusal and 503 only for a real fault", () => {
    // The queue treats non-2xx as "try later", so a 403 for a deactivated seat
    // would make a phone retry the same rejected visit until the battery died.
    expect(route).toContain("503");
    expect(route).not.toContain("status: 403");
  });
});

describe("the PWA is registered, not just described", () => {
  it("ships a manifest scoped to the whole portal", () => {
    const manifest = JSON.parse(read("public/partner-field.webmanifest")) as {
      start_url: string;
      scope: string;
      display: string;
    };
    expect(manifest.start_url).toBe("/partner/attendance");
    // Scoped to /partner, not /partner/attendance: an installed app that kicked
    // the user into a browser tab the moment they tapped a merchant would be
    // worse than no install.
    expect(manifest.scope).toBe("/partner");
    expect(manifest.display).toBe("standalone");
  });

  it("registers the service worker from the field layout", () => {
    const layout = read("src/app/(platform)/partner/attendance/layout.tsx");
    expect(layout).toContain("ServiceWorkerRegister");
    expect(layout).toContain("/partner-field.webmanifest");
  });
});

describe("auto-close", () => {
  it("runs from the daily cron rather than a seventh schedule", () => {
    const cron = read("src/app/api/cron/partner-digest/route.ts");
    expect(cron).toContain("autoCloseSessions");
    expect(cron).toContain("autoClosed");
  });

  it("flags the row rather than inventing a plausible check-out time", () => {
    // A day nobody checked out of is a fact a manager needs, not one to paper
    // over with a 6pm that nobody typed.
    const actions = read("src/server/partners/attendance-actions.ts");
    const fn = actions.slice(actions.indexOf("export async function autoCloseSessions"));
    expect(fn).toContain("autoClosed: true");
    expect(fn).toContain('T00:00:00+08:00');
  });
});
