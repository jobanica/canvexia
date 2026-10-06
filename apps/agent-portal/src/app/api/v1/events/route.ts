import { NextResponse } from "next/server";
import { authenticateProduct } from "@/server/api-auth";
import { receiveEvent } from "@/server/events/ingest";

export const dynamic = "force-dynamic";

/** Events are small JSON. A receipt image is uploaded separately, never inline. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * POST /api/v1/events — one event from a product.
 *
 *   200  processed | pending | duplicate | refused  (stop retrying)
 *   400  not JSON
 *   401  unknown product, bad signature, or older than five minutes
 *   413  too large
 *   422  JSON, but not a valid event (fix it; resending unchanged won't help)
 *   500  our fault; retry
 *
 * The body is read as text and verified as text: the signature covers the
 * exact bytes sent, not a re-serialisation of them.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  const auth = await authenticateProduct(req, rawBody);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await receiveEvent(auth.productId, json);
    return NextResponse.json(result.body, { status: result.http });
  } catch (e) {
    console.error(`[api/events] ${auth.slug}:`, e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
