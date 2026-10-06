import { NextResponse } from "next/server";
import { lookupAgentCode, normalizeReferralCode } from "@servd/core/agent-kit";
import { portalConfig } from "@/server/agent-portal/config";
import { rateLimit } from "@/server/build/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent-code/{code} — the signup form's "Referred by …" check.
 *
 * The browser asks Servd; Servd asks the agent portal with its own signed
 * request. The secret never leaves the server. Rate-limited per IP so this is
 * not a way to enumerate agents.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const limited = await rateLimit("agent:code");
  if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { code: raw } = await params;
  const code = normalizeReferralCode(decodeURIComponent(raw));
  if (!code) return NextResponse.json({ code: raw, valid: false, active: false, agent_name: null });

  const config = portalConfig();
  if (!config) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const result = await lookupAgentCode(config, code);
  if (!result) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(result);
}
