import { NextResponse } from "next/server";
import { getSignedIn } from "@/server/auth";
import { agentDb } from "@/server/scoped-db";
import { linkFor } from "@/server/contracts";

export const dynamic = "force-dynamic";

/**
 * An agent opens the signing page on their phone for the customer in front of
 * them. agentDb is the check: another agent's customer is simply not found.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await getSignedIn();
  if (!who || who.kind !== "agent" || who.status !== "active") return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  const r = await agentDb(who.agentId, (tx) => tx.agentReferral.findUnique({ where: { id }, select: { id: true } })).catch(() => null);
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.redirect(linkFor(r.id).url);
}
