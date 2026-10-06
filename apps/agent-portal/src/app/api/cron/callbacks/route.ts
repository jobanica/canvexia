import { NextResponse } from "next/server";
import { flushCallbacks } from "@/server/callbacks";

export const dynamic = "force-dynamic";

/** Vercel Cron: deliver queued portal → product callbacks, with retries. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await flushCallbacks(100));
}
