import "server-only";

import { cookies } from "next/headers";
import { systemDb } from "@/server/tenancy/scoped-db";
import { manilaDayKey } from "@/lib/time/manila";
import { decodeUtm, UTM_COOKIE, type Utm } from "@/lib/utm";

/**
 * The two funnel stages that happen BEFORE the builder exists: a landing view
 * and a CTA click. Everything after them is already measurable from the
 * restaurant row, so these are the only counters this file keeps.
 *
 * Counted per Manila day and UTM combination rather than one row per hit — a
 * campaign produces a lot of views and none of them is individually
 * interesting. Every write is best-effort: a metric must never cost a visitor
 * their page.
 */

export type LandingEvent = "view" | "cta";

export const LANDING_EVENTS: LandingEvent[] = ["view", "cta"];

export function isLandingEvent(v: unknown): v is LandingEvent {
  return typeof v === "string" && (LANDING_EVENTS as string[]).includes(v);
}

/** The attribution this browser is carrying, from the middleware cookie. */
export async function currentUtm(): Promise<Utm> {
  try {
    const jar = await cookies();
    return decodeUtm(jar.get(UTM_COOKIE)?.value);
  } catch {
    return decodeUtm(null);
  }
}

export async function recordLanding(event: LandingEvent, utm: Utm): Promise<void> {
  const day = manilaDayKey(new Date());
  try {
    await systemDb((tx) =>
      tx.landingStat.upsert({
        where: {
          day_event_source_medium_campaign_content: {
            day,
            event,
            source: utm.source,
            medium: utm.medium,
            campaign: utm.campaign,
            content: utm.content,
          },
        },
        create: { day, event, ...utm, count: 1 },
        update: { count: { increment: 1 } },
        select: { id: true },
      }),
    );
  } catch {
    /* not migrated yet, or a concurrent insert — never worth failing a view */
  }
}
