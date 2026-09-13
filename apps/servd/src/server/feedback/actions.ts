"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";

const schema = z.object({
  slug: z.string().min(1),
  tableToken: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * Diner feedback after payment. EVERY diner gets the same ask: 1–5 stars + an
 * optional comment. The Google review invite is shown to everyone regardless of
 * rating — we never route only happy diners to Google (review gating is
 * prohibited and is intentionally NOT built here). `googleInviteShown` records
 * that the invite was offered.
 */
export async function submitFeedback(input: {
  slug: string;
  tableToken: string;
  rating: number;
  comment?: string;
}): Promise<{ ok: boolean; feedbackId?: string; googleReviewUrl?: string | null; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid feedback" };
  }

  const ctx = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug: parsed.data.slug, status: "active" },
      select: { id: true, googleReviewUrl: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: parsed.data.tableToken },
      select: { id: true },
    });
    if (!table) return null;
    // Tie to the most recent order at this table for context (optional).
    const order = await tx.order.findFirst({
      where: { tableId: table.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return { restaurant, orderId: order?.id ?? null };
  });
  if (!ctx) return { ok: false, error: "Table unavailable." };

  const feedback = await tenantDb(ctx.restaurant.id, (tx) =>
    tx.feedback.create({
      data: {
        restaurantId: ctx.restaurant.id,
        orderId: ctx.orderId,
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
        googleInviteShown: !!ctx.restaurant.googleReviewUrl,
      },
      select: { id: true },
    }),
  );

  return {
    ok: true,
    feedbackId: feedback.id,
    googleReviewUrl: ctx.restaurant.googleReviewUrl,
  };
}

/** Records that a diner tapped through to leave a Google review. */
export async function recordGoogleClick(feedbackId: string): Promise<void> {
  await systemDb((tx) =>
    tx.feedback.updateMany({
      where: { id: feedbackId },
      data: { googleClick: true },
    }),
  );
}
