import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateProduct } from "@/server/api-auth";
import { systemDb } from "@/server/scoped-db";
import { linkFor } from "@/server/contracts";

export const dynamic = "force-dynamic";

const Body = z.object({ external_customer_id: z.string().min(1).max(200) });

/**
 * POST /api/v1/contracts/links — a signing link for one of the calling
 * product's customers. 404 until the portal has processed that customer's
 * signup (the product should retry shortly).
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const auth = await authenticateProduct(req, rawBody);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let parsed;
  try {
    parsed = Body.safeParse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "external_customer_id required" }, { status: 422 });

  const r = await systemDb((tx) =>
    tx.agentReferral.findUnique({
      where: { productId_externalCustomerId: { productId: auth.productId, externalCustomerId: parsed.data.external_customer_id } },
      select: { id: true, _count: { select: { contracts: true } } },
    }),
  );
  if (!r) return NextResponse.json({ error: "unknown_customer" }, { status: 404 });
  const { url, expiresAt } = linkFor(r.id);
  return NextResponse.json({ url, expires_at: expiresAt.toISOString(), already_signed: r._count.contracts > 0 });
}
