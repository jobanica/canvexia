import { flushOutbox } from "@/server/agent-portal/outbox";

export const dynamic = "force-dynamic";

/** Deliver queued agent-portal events (vercel.json: every 5 minutes). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await flushOutbox(100));
}
