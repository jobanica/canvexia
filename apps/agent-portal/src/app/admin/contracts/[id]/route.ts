import { NextResponse } from "next/server";
import { getSignedIn } from "@/server/auth";
import { staffDb } from "@/server/scoped-db";
import { signedUrl } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Staff copy of a signed contract PDF, by contract id. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await getSignedIn();
  if (!who || who.kind !== "staff") return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  const c = await staffDb(who.role, (tx) => tx.agentContract.findUnique({ where: { id }, select: { pdfPath: true } })).catch(() => null);
  if (!c?.pdfPath) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = await signedUrl(c.pdfPath, 300);
  if (!url) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.redirect(url);
}
