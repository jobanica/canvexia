import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { pruneRateLimits } from "./rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Previews that never activate pile up. Nightly we archive the stale ones and
 * drop their heavy media, but we NEVER delete the row: the contact details are
 * the founder's warm-lead follow-up list, and the funnel numbers have to stay
 * honest. Anything with an activation attempt is left alone entirely.
 */
const STALE_DAYS = 30;

export interface PreviewCleanupSummary {
  archived: number;
  rateLimitsPruned: number;
  previewLoginsRemoved: number;
}

export async function runPreviewCleanup(now = new Date()): Promise<PreviewCleanupSummary> {
  const cutoff = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);
  let archived = 0;

  try {
    const stale = await systemDb((tx) =>
      tx.restaurant.findMany({
        where: {
          status: "preview",
          builtVia: "diy",
          previewCreatedAt: { lt: cutoff },
          activationRequestedAt: null,
          // Belt and braces: never touch one that has any activation attempt.
          activationRequests: { none: {} },
        },
        select: { id: true },
      }),
    );

    for (const r of stale) {
      await systemDb(async (tx) => {
        // Drop the media, keep the lead: name + contact stay on the row.
        await tx.menuItem.updateMany({ where: { restaurantId: r.id }, data: { imageUrl: null } });
        await tx.restaurant.update({
          where: { id: r.id },
          data: {
            status: "archived",
            logoUrl: null,
            coverImageUrl: null,
            buildToken: null, // the stale build link stops working
          },
          select: { id: true },
        });
      });
      archived++;
    }
  } catch {
    /* builder columns not migrated yet — nothing to clean */
  }

  return {
    archived,
    previewLoginsRemoved: await sweepExpiredPreviewLogins(now),
    rateLimitsPruned: await pruneRateLimits(),
  };
}

/**
 * Delete demo logins that have run out.
 *
 * Tidiness, not enforcement. An expired login already stops working — the
 * session layer checks the expiry on every request — so this only clears the
 * rows and their Supabase auth users so they don't accumulate. It must never
 * throw: the nightly job also archives stale previews, and losing that over a
 * leftover demo account would be the wrong trade.
 */
async function sweepExpiredPreviewLogins(now: Date): Promise<number> {
  try {
    const dead = await systemDb((tx) =>
      tx.staffUser.findMany({
        where: { previewExpiresAt: { not: null, lte: now } },
        select: { id: true, authUserId: true },
      }),
    );
    if (dead.length === 0) return 0;

    await systemDb((tx) =>
      tx.staffUser.deleteMany({ where: { id: { in: dead.map((d) => d.id) } } }),
    );

    const admin = createSupabaseAdminClient();
    for (const d of dead) {
      try {
        await admin.auth.admin.deleteUser(d.authUserId);
      } catch {
        /* the staff row is gone, so the login no longer resolves */
      }
    }
    return dead.length;
  } catch {
    return 0; // column not migrated — no preview login can exist
  }
}
