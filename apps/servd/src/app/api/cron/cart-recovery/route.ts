import { NextRequest } from "next/server";
import { runCartRecovery } from "@/server/marketing/cart-recovery";

/**
 * Abandoned-cart recovery cron (configure in vercel.json). Protected by
 * CRON_SECRET: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const summary = await runCartRecovery();
  return Response.json(summary);
}
