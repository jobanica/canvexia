import "server-only";
import { SIGNATURE_HEADERS, verifyRequest, type SignedBody } from "@servd/core/agent-kit";
import { productForApi } from "@/server/products";

/**
 * Authenticate a product's request to /api/v1/*.
 *
 * Unknown product, inactive product, bad signature and stale timestamp all get
 * the same 401: telling a stranger which of those it was tells them which
 * product slugs exist. The reason goes to the server log instead.
 */
export async function authenticateProduct(
  req: Request,
  rawBody: SignedBody,
): Promise<{ ok: true; productId: string; slug: string } | { ok: false }> {
  const slug = req.headers.get(SIGNATURE_HEADERS.product) ?? "";
  const product = await productForApi(slug);
  if (!product) {
    console.warn(`[api] unknown or inactive product "${slug.slice(0, 40)}"`);
    return { ok: false };
  }
  const result = verifyRequest({
    secret: product.secret,
    timestamp: req.headers.get(SIGNATURE_HEADERS.timestamp),
    signature: req.headers.get(SIGNATURE_HEADERS.signature),
    method: req.method,
    pathname: new URL(req.url).pathname,
    rawBody,
  });
  if (!result.ok) {
    console.warn(`[api] ${product.slug}: ${result.reason}`);
    return { ok: false };
  }
  return { ok: true, productId: product.id, slug: product.slug };
}
