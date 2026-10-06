import "server-only";
import { configFromEnv, type AgentPortalConfig } from "@servd/core/agent-kit";

/**
 * Resceta's connection to the agent portal — the same kit and the same
 * variables as Servd, with Resceta's own product slug and secret. Unset, the
 * product still works and queues its events until it is configured.
 */
export function portalConfig(): AgentPortalConfig | null {
  return configFromEnv({
    AGENT_PORTAL_URL: process.env.AGENT_PORTAL_URL,
    AGENT_PORTAL_PRODUCT_SLUG: process.env.AGENT_PORTAL_PRODUCT_SLUG,
    AGENT_PORTAL_SECRET: process.env.AGENT_PORTAL_SECRET,
  });
}

export function productSlug(): string {
  return process.env.AGENT_PORTAL_PRODUCT_SLUG?.trim() || "pharmacy";
}

export function paymentInstructions() {
  const bankName = process.env.PAYMENT_BANK_NAME?.trim();
  const accountName = process.env.PAYMENT_ACCOUNT_NAME?.trim();
  const accountNumber = process.env.PAYMENT_ACCOUNT_NUMBER?.trim();
  const qrImageUrl = process.env.PAYMENT_QR_IMAGE_URL?.trim() || null;
  if (!bankName || !accountName || !accountNumber) return null;
  return { bankName, accountName, accountNumber, qrImageUrl };
}
