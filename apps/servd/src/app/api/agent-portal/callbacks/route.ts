import { NextResponse } from "next/server";
import { verifyCallback } from "@servd/core/agent-kit";
import { portalConfig } from "@/server/agent-portal/config";
import { applyPortalCallback } from "@/server/agent-portal/callbacks";
import { systemDb } from "@/server/tenancy/scoped-db";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent-portal/callbacks — payment.confirmed / rejected / reversed
 * and contract.signed from agents.canvexia.com.
 *
 * Register this URL as Servd's callback URL in the portal's Products screen.
 * Verified with Servd's own API secret over the raw body, then applied once
 * (the inbox dedupes redeliveries). Anything the portal sends that names a
 * restaurant or receipt Servd does not know is recorded and answered 200 —
 * retrying it would not make it known.
 */
export async function POST(req: Request) {
  const config = portalConfig();
  if (!config) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const rawBody = await req.text();
  if (rawBody.length > 64 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const verified = verifyCallback(config, req, rawBody);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  try {
    const outcome = await systemDb((tx) => applyPortalCallback(tx, config.productSlug, verified.callback));
    return NextResponse.json({ event_id: verified.callback.event_id, outcome });
  } catch (e) {
    console.error("[agent-portal/callbacks]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
