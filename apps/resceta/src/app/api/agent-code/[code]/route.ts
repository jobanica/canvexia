import { NextResponse } from "next/server";
import { lookupAgentCode, normalizeReferralCode } from "@servd/core/agent-kit";
import { portalConfig } from "@/server/agent-portal/config";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** The signup form's "Referred by …" check, proxied so the secret stays server-side. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!(await rateLimit("resceta:code"))) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { code: raw } = await params;
  const code = normalizeReferralCode(decodeURIComponent(raw));
  if (!code) return NextResponse.json({ code: raw, valid: false, active: false, agent_name: null });
  const config = portalConfig();
  const result = config ? await lookupAgentCode(config, code) : null;
  return result ? NextResponse.json(result) : NextResponse.json({ error: "unavailable" }, { status: 503 });
}
