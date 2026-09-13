import "server-only";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import { SEGMENTS, isSegment, type SegmentKey } from "@/lib/email/segments";
import { suppressOnUnsubscribe } from "./followup";

/**
 * Who a campaign goes to. Segments mirror the DIY funnel, because that's what
 * the follow-up is actually for: someone who built a menu and stopped is a very
 * different message from someone who paid.
 *
 * Everyone here is a restaurant OWNER who gave us their address on the builder.
 * Diners are never in this audience — that's the per-restaurant SMS system.
 */

export type { SegmentKey };
export { SEGMENTS, isSegment };

export interface Recipient {
  restaurantId: string;
  name: string;
  email: string;
  unsubToken: string;
  /** Feeds the {{activate}} / {{preview}} links — see lib/email/render.ts. */
  status: string;
  slug: string;
  buildToken: string | null;
}

/**
 * The `where` for each segment. Two rules apply to every one of them: there has
 * to be an address, and anyone who unsubscribed is excluded — the opt-out is
 * enforced at the query, so it can't be forgotten at a call site.
 */
function whereFor(segment: SegmentKey): Prisma.RestaurantWhereInput {
  const base: Prisma.RestaurantWhereInput = {
    contactEmail: { not: null },
    emailOptOut: false,
  };
  switch (segment) {
    case "leads":
      return { ...base, status: { in: ["preview", "archived"] } };
    case "no_preview":
      return { ...base, status: "preview", previewReachedAt: null };
    case "previewed":
      return {
        ...base,
        status: "preview",
        previewReachedAt: { not: null },
        activationRequestedAt: null,
      };
    case "abandoned_payment":
      return { ...base, status: "preview", activationRequestedAt: { not: null } };
    case "customers":
      return { ...base, status: "active" };
    case "all":
    default:
      return base;
  }
}

/** How many people a segment would reach right now (for the composer). */
export async function countSegment(segment: SegmentKey): Promise<number> {
  try {
    return await systemDb((tx) => tx.restaurant.count({ where: whereFor(segment) }));
  } catch {
    return 0; // columns not migrated yet
  }
}

/** Counts for every segment at once, for the composer's picker. */
export async function countAllSegments(): Promise<Record<SegmentKey, number>> {
  const entries = await Promise.all(
    SEGMENTS.map(async (s) => [s.key, await countSegment(s.key)] as const),
  );
  return Object.fromEntries(entries) as Record<SegmentKey, number>;
}

/**
 * Resolve a segment to addressable recipients, minting an unsubscribe token
 * for anyone who doesn't have one yet — every email we send must carry a
 * working one-click unsubscribe, so the token is part of being addressable.
 */
export async function resolveSegment(segment: SegmentKey, limit: number): Promise<Recipient[]> {
  let rows: {
    id: string;
    name: string;
    slug: string;
    status: string;
    buildToken: string | null;
    contactEmail: string | null;
    unsubToken: string | null;
  }[];
  try {
    rows = await systemDb((tx) =>
      tx.restaurant.findMany({
        where: whereFor(segment),
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          buildToken: true,
          contactEmail: true,
          unsubToken: true,
        },
      }),
    );
  } catch {
    return [];
  }

  const out: Recipient[] = [];
  for (const r of rows) {
    const email = r.contactEmail?.trim();
    if (!email) continue;
    let token = r.unsubToken;
    if (!token) {
      token = randomBytes(18).toString("base64url");
      try {
        await systemDb((tx) =>
          tx.restaurant.update({ where: { id: r.id }, data: { unsubToken: token }, select: { id: true } }),
        );
      } catch {
        continue; // can't guarantee an unsubscribe link → don't email them
      }
    }
    out.push({
      restaurantId: r.id,
      name: r.name,
      email,
      unsubToken: token,
      status: r.status,
      slug: r.slug,
      buildToken: r.buildToken,
    });
  }
  return out;
}

/** Flip the opt-out from the public unsubscribe link. Idempotent. */
export async function unsubscribeByToken(token: string): Promise<{ name: string } | null> {
  if (!token) return null;
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { unsubToken: token }, select: { id: true, name: true } }),
    );
    if (!r) return null;
    await systemDb((tx) =>
      tx.restaurant.update({ where: { id: r.id }, data: { emailOptOut: true }, select: { id: true } }),
    );
    // Flag alone isn't enough — cancel what's already queued for them, so an
    // unsubscribe takes effect now rather than at the next scheduler pass.
    await suppressOnUnsubscribe(r.id);
    return { name: r.name };
  } catch {
    return null;
  }
}
