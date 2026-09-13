"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import type { FeedbackMode } from "@prisma/client";

export type FormState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  googleReviewUrl: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
  feedbackMode: z.enum(["on_device", "follow_up", "both"]),
});

export async function updateReputationSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const parsed = schema.safeParse({
    googleReviewUrl: formData.get("googleReviewUrl") ?? "",
    feedbackMode: formData.get("feedbackMode"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }

  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        googleReviewUrl: parsed.data.googleReviewUrl || null,
        feedbackMode: parsed.data.feedbackMode as FeedbackMode,
      },
      select: { id: true },
    }),
  );

  revalidatePath("/admin/reputation");
  return { ok: true };
}
