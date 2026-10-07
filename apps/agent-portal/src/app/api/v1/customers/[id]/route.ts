import { NextResponse } from "next/server";
import { authenticateProduct } from "@/server/api-auth";
import { customerTerms } from "@/server/customers";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/customers/{external_customer_id} — what this customer pays and
 * where they stand, from the rule they signed up under. A product shows its
 * billing page from this rather than from prices of its own, so the prices
 * live in one place: the commission rule.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateProduct(req, "");
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await customerTerms(auth.productId, decodeURIComponent(id).slice(0, 200)));
}
