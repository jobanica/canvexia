import "server-only";
import { configFromEnv, type AgentPortalConfig } from "@servd/core/agent-kit";

/**
 * Servd's connection to the agent portal (agents.canvexia.com).
 *
 * Null until AGENT_PORTAL_URL, AGENT_PORTAL_PRODUCT_SLUG and
 * AGENT_PORTAL_SECRET are all set. Unconfigured, signups still work and still
 * queue their events — they are delivered once the portal is configured — and
 * the billing page says payments are not open yet rather than failing.
 */
export function portalConfig(): AgentPortalConfig | null {
  // Spelled out rather than passing process.env whole, so the turbo env drift
  // test (tests/deploy/turbo-env.test.ts) can see what is read.
  return configFromEnv({
    AGENT_PORTAL_URL: process.env.AGENT_PORTAL_URL,
    AGENT_PORTAL_PRODUCT_SLUG: process.env.AGENT_PORTAL_PRODUCT_SLUG,
    AGENT_PORTAL_SECRET: process.env.AGENT_PORTAL_SECRET,
  });
}

/** The slug events are queued under, configured or not. */
export function productSlug(): string {
  return process.env.AGENT_PORTAL_PRODUCT_SLUG?.trim() || "servd";
}

/** Where owners send money. Public information, shown on the billing page. */
export function paymentInstructions() {
  const bankName = process.env.PAYMENT_BANK_NAME?.trim();
  const accountName = process.env.PAYMENT_ACCOUNT_NAME?.trim();
  const accountNumber = process.env.PAYMENT_ACCOUNT_NUMBER?.trim();
  const qrImageUrl = process.env.PAYMENT_QR_IMAGE_URL?.trim() || null;
  if (!bankName || !accountName || !accountNumber) return null;
  return { bankName, accountName, accountNumber, qrImageUrl };
}
