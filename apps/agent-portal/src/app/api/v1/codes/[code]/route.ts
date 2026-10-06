import { NextResponse } from "next/server";
import { authenticateProduct } from "@/server/api-auth";
import { lookupCode } from "@/server/agents";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/codes/{code} — is this a referral code, and whose?
 *
 * Signed like every product call (empty body), so the agent directory is not
 * an open endpoint anyone can walk.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const auth = await authenticateProduct(req, "");
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { code } = await params;
  return NextResponse.json(await lookupCode(decodeURIComponent(code).slice(0, 40)));
}
