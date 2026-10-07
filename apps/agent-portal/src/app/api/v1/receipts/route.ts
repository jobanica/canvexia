import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { RECEIPT_MAX_BYTES } from "@servd/core/agent-kit";
import { authenticateProduct } from "@/server/api-auth";
import { putPrivateObject } from "@/server/storage";
import { EXT, sniffImageType } from "@/lib/image-type";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/receipts — one receipt image, raw bytes, signed.
 *
 * Returns the private path the product then puts in `payment.submitted`.
 * Stored under the product's slug, so a path in an event from one product can
 * be checked against the product that sent it.
 */
export async function POST(req: Request) {
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > RECEIPT_MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  const auth = await authenticateProduct(req, bytes);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const type = sniffImageType(bytes);
  if (!type) return NextResponse.json({ error: "not_an_image" }, { status: 422 });

  const now = new Date();
  const path = `receipts/${auth.slug}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${EXT[type]}`;
  try {
    await putPrivateObject(path, bytes, type);
  } catch (e) {
    console.error(`[api/receipts] ${auth.slug}:`, e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ receipt_path: path });
}
