import { signedHeaders, verifyRequest, SIGNATURE_HEADERS, type SignedBody } from "./signing";
import { portalCallbackSchema, type PortalCallback } from "./callbacks";
import type { CodeLookupResponse, CustomerTermsResponse, EventResponse, ProductEvent } from "./events";

/**
 * The product side of the portal API. Every function here takes the config
 * explicitly: nothing reads process.env except configFromEnv(), so a test can
 * point it at anything and a product can hold more than one.
 */
export interface AgentPortalConfig {
  /** e.g. https://agents.canvexia.com — no trailing slash needed. */
  baseUrl: string;
  /** This product's row in agent_products. */
  productSlug: string;
  /** This product's API secret. Server-only. */
  secret: string;
}

/**
 * AGENT_PORTAL_URL, AGENT_PORTAL_PRODUCT_SLUG, AGENT_PORTAL_SECRET. Null when
 * any is missing: the product then queues events and sends nothing, rather
 * than failing a signup because the portal is not configured yet.
 */
export function configFromEnv(env: Record<string, string | undefined>): AgentPortalConfig | null {
  const baseUrl = env.AGENT_PORTAL_URL?.trim();
  const productSlug = env.AGENT_PORTAL_PRODUCT_SLUG?.trim();
  const secret = env.AGENT_PORTAL_SECRET?.trim();
  if (!baseUrl || !productSlug || !secret) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), productSlug, secret };
}

type Fetch = typeof fetch;

async function call(
  config: AgentPortalConfig,
  method: "GET" | "POST",
  pathname: string,
  body: SignedBody,
  contentType: string,
  fetchImpl: Fetch,
  timeoutMs: number,
): Promise<{ status: number; json: unknown }> {
  const headers = signedHeaders({
    productSlug: config.productSlug,
    secret: config.secret,
    method,
    pathname,
    rawBody: body,
  });
  const res = await fetchImpl(`${config.baseUrl}${pathname}`, {
    method,
    headers: { ...headers, "content-type": contentType },
    body: method === "GET" ? undefined : (body as BodyInit),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON error page from a proxy — status is what matters */
  }
  return { status: res.status, json };
}

/** Is this a code, and whose? Never throws: a portal outage reads as "can't tell". */
export async function lookupAgentCode(
  config: AgentPortalConfig,
  code: string,
  fetchImpl: Fetch = fetch,
): Promise<CodeLookupResponse | null> {
  try {
    const r = await call(config, "GET", `/api/v1/codes/${encodeURIComponent(code)}`, "", "application/json", fetchImpl, 5_000);
    return r.status === 200 ? (r.json as CodeLookupResponse) : null;
  } catch {
    return null;
  }
}

/** What this customer pays and where they stand. Null on any failure. */
export async function getCustomerTerms(
  config: AgentPortalConfig,
  externalCustomerId: string,
  fetchImpl: Fetch = fetch,
): Promise<CustomerTermsResponse | null> {
  try {
    const r = await call(
      config, "GET", `/api/v1/customers/${encodeURIComponent(externalCustomerId)}`, "", "application/json", fetchImpl, 5_000,
    );
    return r.status === 200 ? (r.json as CustomerTermsResponse) : null;
  } catch {
    return null;
  }
}

/**
 * A link to the portal's signing page for this customer. Null if the portal
 * has not processed the customer's signup yet, or cannot be reached — the
 * product should say "try again in a moment" rather than fail.
 */
export async function requestSigningLink(
  config: AgentPortalConfig,
  externalCustomerId: string,
  fetchImpl: Fetch = fetch,
): Promise<{ url: string; expiresAt: string; alreadySigned: boolean } | null> {
  try {
    const r = await call(
      config, "POST", "/api/v1/contracts/links", JSON.stringify({ external_customer_id: externalCustomerId }), "application/json", fetchImpl, 10_000,
    );
    const j = r.json as { url?: string; expires_at?: string; already_signed?: boolean } | null;
    if (r.status !== 200 || !j?.url) return null;
    return { url: j.url, expiresAt: j.expires_at ?? "", alreadySigned: !!j.already_signed };
  } catch {
    return null;
  }
}

export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Upload a receipt image to the portal's private storage. Synchronous with
 * the customer's submit, not queued: the customer is looking at the form, and
 * "try again" is a better answer than a receipt that silently never arrives.
 */
export async function uploadReceipt(
  config: AgentPortalConfig,
  bytes: Uint8Array,
  contentType: string,
  fetchImpl: Fetch = fetch,
): Promise<{ ok: true; receiptPath: string } | { ok: false; error: string }> {
  if (!(RECEIPT_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, error: "The receipt must be a JPEG, PNG or WebP image." };
  }
  if (bytes.byteLength === 0 || bytes.byteLength > RECEIPT_MAX_BYTES) {
    return { ok: false, error: "The receipt image must be under 4 MB." };
  }
  try {
    const r = await call(config, "POST", "/api/v1/receipts", bytes, contentType, fetchImpl, 30_000);
    const path = (r.json as { receipt_path?: string } | null)?.receipt_path;
    if (r.status === 200 && path) return { ok: true, receiptPath: path };
    return { ok: false, error: "The receipt could not be uploaded. Please try again." };
  } catch {
    return { ok: false, error: "The receipt could not be uploaded. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Event delivery: what the outbox does with one row
// ---------------------------------------------------------------------------

export type DeliveryResult =
  /** The portal has it (processed, pending, duplicate or refused). Stop. */
  | { kind: "delivered"; response: EventResponse }
  /** Will never succeed as sent. Stop, and surface it. */
  | { kind: "failed"; status: number; error: string }
  /** Try again later. */
  | { kind: "retry"; status: number | null; error: string };

/**
 * Status codes that retrying cannot fix. 401 is deliberately NOT here: a bad
 * secret is fixed by configuration, and the queued events should go through
 * once it is.
 */
const PERMANENT = new Set([400, 404, 413, 422]);

export async function deliverEvent(
  config: AgentPortalConfig,
  event: ProductEvent,
  fetchImpl: Fetch = fetch,
): Promise<DeliveryResult> {
  try {
    const r = await call(config, "POST", "/api/v1/events", JSON.stringify(event), "application/json", fetchImpl, 15_000);
    if (r.status === 200) return { kind: "delivered", response: r.json as EventResponse };
    const error = String((r.json as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
    return PERMANENT.has(r.status) ? { kind: "failed", status: r.status, error } : { kind: "retry", status: r.status, error };
  } catch (e) {
    return { kind: "retry", status: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * When to try again after `attempts` failures: 30s, 1m, 2m, 4m … capped at
 * six hours, so a portal outage over a weekend is retried a few times an hour
 * at most and catches up on its own once it is back.
 */
export function retryDelayMs(attempts: number): number {
  const base = 30_000 * 2 ** Math.max(0, attempts - 1);
  return Math.min(base, 6 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Callbacks: verifying what the portal sends back
// ---------------------------------------------------------------------------

export type VerifiedCallback =
  | { ok: true; callback: PortalCallback }
  | { ok: false; status: 400 | 401 | 422; error: string };

/**
 * Verify and parse one portal callback. The caller passes the raw body text
 * exactly as received.
 */
export function verifyCallback(
  config: AgentPortalConfig,
  req: { method: string; url: string; headers: Headers },
  rawBody: string,
  now?: Date,
): VerifiedCallback {
  if (req.headers.get(SIGNATURE_HEADERS.product) !== config.productSlug) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const v = verifyRequest({
    secret: config.secret,
    timestamp: req.headers.get(SIGNATURE_HEADERS.timestamp),
    signature: req.headers.get(SIGNATURE_HEADERS.signature),
    method: req.method,
    pathname: new URL(req.url).pathname,
    rawBody,
    now,
  });
  if (!v.ok) return { ok: false, status: 401, error: "unauthorized" };
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
  const parsed = portalCallbackSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, status: 422, error: `${issue.path.join(".")}: ${issue.message}` };
  }
  return { ok: true, callback: parsed.data };
}

/** A unique event id for a product event. */
export function newEventId(): string {
  return `evt_${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Portal side: delivering a callback to a product
// ---------------------------------------------------------------------------

export type CallbackDelivery =
  | { kind: "delivered" }
  | { kind: "failed"; status: number; error: string }
  | { kind: "retry"; status: number | null; error: string };

/**
 * POST one signed callback to a product's callback URL. Signed with that
 * product's secret over the URL's own path, so the product verifies it with
 * verifyCallback() and the same secret it signs its events with.
 *
 * Any 2xx is delivered — the product answers 200 for a duplicate too.
 */
export async function deliverCallback(
  target: { callbackUrl: string; productSlug: string; secret: string },
  callback: PortalCallback,
  fetchImpl: Fetch = fetch,
): Promise<CallbackDelivery> {
  const url = new URL(target.callbackUrl);
  const body = JSON.stringify(callback);
  try {
    const res = await fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        ...signedHeaders({
          productSlug: target.productSlug,
          secret: target.secret,
          method: "POST",
          pathname: url.pathname,
          rawBody: body,
        }),
        "content-type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.status >= 200 && res.status < 300) return { kind: "delivered" };
    const error = `HTTP ${res.status}`;
    return PERMANENT.has(res.status) ? { kind: "failed", status: res.status, error } : { kind: "retry", status: res.status, error };
  } catch (e) {
    return { kind: "retry", status: null, error: e instanceof Error ? e.message : String(e) };
  }
}
